const express = require('express');
const router = express.Router();

// In-memory store for logs. Structure: { deviceId: [log1, log2, ...] }
// In a real production app, this should be in Redis or a DB, 
// but in-memory is fine for an active debug dashboard.
global.appLogs = {}; 
const MAX_LOGS_PER_DEVICE = 1000; // Keep memory in check

// 1. Record a new log
router.post('/record', (req, res) => {
    const { deviceId, type, message } = req.body;
    
    if (!deviceId || !message) {
        return res.status(400).json({ success: false, error: "deviceId and message are required" });
    }

    if (!global.appLogs[deviceId]) {
        global.appLogs[deviceId] = [];
    }

    const logEntry = {
        type: type || 'PRINT',
        message: message,
        timestamp: new Date().toISOString()
    };

    global.appLogs[deviceId].push(logEntry);

    // Trim logs if they get too large
    if (global.appLogs[deviceId].length > MAX_LOGS_PER_DEVICE) {
        global.appLogs[deviceId].shift(); // Remove oldest log
    }

    return res.status(200).json({ success: true });
});

// 2. Clear logs for a specific device (Called when app starts)
router.post('/clear', (req, res) => {
    const { deviceId } = req.body;
    if (deviceId) {
        global.appLogs[deviceId] = [];
    }
    return res.status(200).json({ success: true, message: "Logs cleared" });
});

// 3. Clear all logs across all devices
router.post('/clear-all', (req, res) => {
    global.appLogs = {};
    return res.status(200).json({ success: true, message: "All logs cleared" });
});

// 4. Get logs for dashboard
router.get('/', (req, res) => {
    return res.status(200).json({ success: true, data: global.appLogs });
});

module.exports = router;
