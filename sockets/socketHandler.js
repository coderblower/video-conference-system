const {Server} = require('socket.io');

function setupSocket(server) {
    const io = new Server(server, {
        cors: {
          origin: "*", // Adjust to allow specific origins for security
          methods: ["GET", "POST"]
        }
      });

    // Store users in rooms
    const rooms = {};

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        // Join a room
        socket.on('join-room', (roomId) => {
            socket.join(roomId);

            // Add user to room
            if (!rooms[roomId]) {
                rooms[roomId] = [];
                socket.emit('first_in_room');
            }
            rooms[roomId].push(socket.id);

            console.log(`User ${socket.id} joined room ${roomId}`);

            // Notify other users in the room
            socket.to(roomId).emit('new-user', socket.id);
        });

        // Handle signaling messages (offer/answer/ICE candidates)
        socket.on('message', (data) => {
            const { roomId, to } = data;

            if (to) {
                // Forward message to a specific user
                io.to(to).emit('message', { ...data, from: socket.id });
            } else {
                // Broadcast to all users in the room except sender
                socket.to(roomId).emit('message', { ...data, from: socket.id });
            }
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);

            // Remove user from all rooms they joined
            for (const roomId in rooms) {
                rooms[roomId] = rooms[roomId].filter((id) => id !== socket.id);

                // Notify other users in the room
                socket.to(roomId).emit('user-left', socket.id);

                // Clean up empty rooms
                if (rooms[roomId].length === 0) {
                    delete rooms[roomId];
                }
            }
        });
    });

    return io;
}

module.exports = { setupSocket };
