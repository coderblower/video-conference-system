const socketIo = require('socket.io');

let rooms = {};

function setupSocket(server) {
    const io = socketIo(server);

    // Handle socket connections
    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);
    
        // Handle user joining a room
        socket.on('join-room', (roomId) => {
            console.log(`User ${socket.id} joined room ${roomId}`);
            socket.join(roomId);
    
            // Add user to the room
            if (!rooms[roomId]) {
                rooms[roomId] = [];
            }
            rooms[roomId].push(socket.id);
    
            // Notify other users in the room about the new connection
            socket.to(roomId).emit('user-connected', socket.id);
        });
    
        // Handle signaling messages
        socket.on('message', (data) => {
            const { roomId, to } = data;
    
            // Relay message to the target user
            if (to) {
                io.to(to).emit('message', { ...data, from: socket.id });
            } else {
                console.log('Message target not specified:', data);
            }
        });
    
        // Notify others when a user disconnects
        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
    
            // Remove the user from all rooms
            for (const roomId in rooms) {
                rooms[roomId] = rooms[roomId].filter(userId => userId !== socket.id);
    
                // Notify other users in the room
                socket.to(roomId).emit('user-disconnected', socket.id);
    
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
