require('dotenv').config();

const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');
const passport = require('passport');
const session = require('express-session');
const { dbConnect } = require('./config/db');
const { setupSocket } = require('./sockets/socketHandler');
const { initializeFirebase } = require('./helpers/fcmHelper');
const cors = require('cors');

const app = express();
const port = Number(process.env.PORT || 3001);
app.use(cors());

// Connect to the database
dbConnect();
initializeFirebase().catch((error) => {
    console.error('Firebase initialization failed:', error);
});

// Set up Passport
require('./config/passport')(passport);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
app.use(passport.initialize());

// Serve Logs Dashboard Route
app.get('/logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'logs.html'));
});

// Import and use routes
const authRoutes = require('./routes/authRoutes.js');
const callingRoutes = require('./routes/callingRoutes.js');
const logRoutes = require('./routes/logRoutes.js');

app.use('/api', authRoutes);
app.use('/api/calling', callingRoutes);
app.use('/api/logs', logRoutes);

// Create HTTPS server and set up WebSocket
const server = http.createServer(app);
setupSocket(server);

// Start the server
server.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${port}`);
});
