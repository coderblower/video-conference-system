const http = require('http');
const express = require('express');
const fs = require('fs');
const passport = require('passport');
const session = require('express-session');
const { dbConnect } = require('./config/db');
const { setupSocket } = require('./sockets/socketHandler');

const cors = require('cors');

const app = express();
app.use(cors());

// Connect to the database
dbConnect();

// Initialize VoIP Provider for iOS Push Notifications
initializeVoIPProvider();

// Set up Passport
require('./config/passport')(passport);

// Serve static files
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
app.use(passport.initialize());

// Import and use routes
const authRoutes = require('./routes/authRoutes.js');
// const roomRoutes = require('./routes/roomRoutes');
app.use('/api', authRoutes);
// app.use('/api/room', roomRoutes);

// Create HTTP server and set up WebSocket
const server = http.createServer(app);
const io = setupSocket(server);

// Start the server
server.listen(3001, '0.0.0.0', () => {
    console.log('✅ Server running on http://0.0.0.0:3001');
    console.log('✅ VoIP notifications ready for iOS devices');
});