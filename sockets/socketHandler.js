const socketIo = require('socket.io');

function setupSocket(server) {
    const io = socketIo(server);

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

    return io;
}

module.exports = { setupSocket };
