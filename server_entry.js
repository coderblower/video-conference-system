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

// Create HTTPS server and set up WebSocket
const server = http.createServer(app);
const io = setupSocket(server);

// Start the server
server.listen(3001, '0.0.0.0', () => {
    console.log('Server running on http://localhost:3002');
});
