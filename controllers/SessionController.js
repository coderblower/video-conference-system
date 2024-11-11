const { Session } = require('../models'); // Assuming you have a Session model

// Start a new session (e.g., login or chat session)
exports.createSession = async (req, res) => {
    try {
        const { userId, sessionId } = req.body;

        // Create a new session entry
        const newSession = await Session.create({ userId, sessionId });

        res.status(201).json({ message: 'Session created successfully', session: newSession });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Validate an existing session
exports.validateSession = async (req, res) => {
    try {
        const { sessionId } = req.body;

        // Find the session by sessionId
        const session = await Session.findOne({ where: { sessionId } });
        if (!session) return res.status(404).json({ message: 'Session not found' });

        res.status(200).json({ message: 'Session is valid', session });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};
