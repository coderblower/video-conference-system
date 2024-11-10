const express = require('express');
const https = require('https');
const socketIo = require('socket.io');
const fs = require('fs')

const app = express();

const options = {
    key: fs.readFileSync('ssl/key.pem'),
    cert: fs.readFileSync('ssl/cert.pem')
  };


const server = https.createServer(options, app);
const io = socketIo(server);

// Serve the static HTML page
app.use(express.static('public')); // 'public' folder contains index.html

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected');

    // Join the room when the user accesses a URL like '/index.html/{roomId}'
    socket.on('join-room', (roomId) => {
        
        socket.join(roomId); // Join the room
        
    });

    // Handle signaling messages (offer/answer/ICE candidates)
    socket.on('message', (data) => {
        console.log('hello', data);
        // Forward the signaling message to the other peer in the room
        socket.to(data.roomId).emit('message', data);
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start the server
server.listen(3000, () => {
    console.log('Server running on https://localhost:3000');
});
