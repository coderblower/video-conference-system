const { Room } = require('../models'); // Adjust to your Sequelize model

// Create a new room
exports.createRoom = async (req, res) => {
    try {
        const { roomName } = req.body;

        // Create a new room
        const newRoom = await Room.create({ name: roomName });

        res.status(201).json({ message: 'Room created successfully', room: newRoom });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all rooms
exports.getRooms = async (req, res) => {
    try {
        const rooms = await Room.findAll();
        res.status(200).json(rooms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Join a room (this is handled by Socket.IO in `server.js` but you could implement it here if needed)
exports.joinRoom = (socket, roomId) => {
    socket.join(roomId);
};
