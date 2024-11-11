const { Message } = require('../models'); // Assuming you have a Message model

// Send a message to a room
exports.sendMessage = async (req, res) => {
    try {
        const { roomId, userId, content } = req.body;

        // Store the message in the database
        const newMessage = await Message.create({
            roomId,
            userId,
            content
        });

        // Emit the message to the room via Socket.IO
        req.io.to(roomId).emit('message', {
            userId,
            content,
            timestamp: new Date()
        });

        res.status(201).json({ message: 'Message sent', newMessage });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get all messages from a room
exports.getMessages = async (req, res) => {
    try {
        const { roomId } = req.params;

        // Retrieve all messages for a specific room
        const messages = await Message.findAll({ where: { roomId } });

        res.status(200).json(messages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};
