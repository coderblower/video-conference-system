const http = require('http');
const { Server } = require('socket.io');
const express = require('express');

const app = express();
let usersInRoom = {};  // This will hold users for each room

// Serve the static HTML page
app.use(express.static('public')); // Ensure 'public' folder contains index.html

// Create an HTTP server and integrate it with Express
const server = http.createServer(app);

// Initialize Socket.IO with the server
const io = new Server(server);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Listen for the 'join-room' event
    socket.on('join-room', (roomId) => {
        console.log(`User ${socket.id} joined room ${roomId}`);
        socket.join(roomId);


        if (!usersInRoom[roomId]) {
            usersInRoom[roomId] = [];
        }

        usersInRoom[roomId].push(socket.id);

        socket.emit('existing-users', usersInRoom[roomId]);
        // Notify others in the room about the new connection
        socket.broadcast.to(roomId).emit('user-connected', socket.id);

        

        // Handle WebRTC signaling
        socket.on('offer', (roomId, { offer, userId }) => {
            console.log(`Offer received in room ${roomId} from user ${userId}`);
            console.log("Received offer:", offer);
        
            // Ensure the offer contains the necessary fields
            if (offer && offer.type === 'offer' && offer.sdp) {
                // Emit the offer to the room, including the sender's userId
                socket.to(roomId).emit('offer', userId, offer);
            } else {
                console.error('Invalid offer received:', offer);
            }
        });
        


        socket.on('fetch-users-in-room', (roomId) => {
            // Emit the list of users currently in the room
            socket.emit('existing-users', usersInRoom[roomId] || []);
        });


        socket.on('answer', (roomId, answer, userId) => {
            console.log('fired answer successuflly,', roomId, answer, userId)
            console.log(`Answer received in room ${roomId} from user ${userId}`);
            console.log("Received answer:", answer);
        
            // Ensure the answer contains the necessary fields
            if (answer && answer.type === 'answer' && answer.sdp) {
                // Emit the answer to the room, including the sender's userId
                socket.to(roomId).emit('answer', roomId, userId,  answer);
            } else {
                console.error('Invalid answer received:', answer);
            }
        });

        socket.on('ice-candidate', (data) => {
            const { roomId, candidate, userId } = data;
            console.log(`ICE candidate received in room ${roomId} from ${socket.id}`);
            io.to(roomId).emit('ice-candidate', userId, candidate);
        });

        // Handle user disconnection
        socket.on('disconnect', () => {
            console.log(`User ${socket.id} disconnected`);
            socket.to(roomId).emit('user-disconnected', socket.id);
        });
    });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Socket.IO server running at http://localhost:${PORT}`);
});
