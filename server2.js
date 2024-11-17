const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {}; // Keeps track of users in each room

// Serve static files
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a room
    socket.on('join-room', (roomId) => {
        console.log(`User ${socket.id} joined room ${roomId}`);
        socket.join(roomId);

        if (!rooms[roomId]) rooms[roomId] = [];
        rooms[roomId].push(socket.id);

        // Notify other users in the room
        socket.to(roomId).emit('user-connected', socket.id);
    });

    // Handle signaling messages
    socket.on('message', (data) => {
        const { to } = data;
        if (to) {
            io.to(to).emit('message', { ...data, from: socket.id });
        }
    });

    // Handle user disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        for (const roomId in rooms) {
            rooms[roomId] = rooms[roomId].filter(userId => userId !== socket.id);
            socket.to(roomId).emit('user-disconnected', socket.id);

            // Clean up the room if empty
            if (rooms[roomId].length === 0) {
                delete rooms[roomId];
            }
        }
    });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
