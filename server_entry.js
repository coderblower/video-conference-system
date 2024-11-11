const http = require('http');
const express = require('express');
const fs = require('fs');
const passport = require('passport');
const session = require('express-session');
const { dbConnect } = require('./config/db');
const { setupSocket } = require('./sockets/socketHandler');

const app = express();


// Connect to the database
dbConnect();

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
app.use('/api/auth', authRoutes);
// app.use('/api/room', roomRoutes);

// Create HTTPS server and set up WebSocket
const server = http.createServer(options, app);
const io = setupSocket(server);

// Start the server
server.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
