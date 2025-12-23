const http = require('http');
const express = require('express');
const fs = require('fs');
const passport = require('passport');
const session = require('express-session');
const { dbConnect } = require('./config/db');
const { setupSocket } = require('./sockets/socketHandler');
const { initializeFirebase } = require('./helpers/fcmHelper.js'); // Add this import
const cors = require('cors');

const app = express();
app.use(cors());

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

// Start the server with Firebase initialization
async function startServer() {
    try {
        console.log('\n🚀 Starting server initialization...\n');
        
        // 1. Connect to MongoDB
        console.log('📦 Connecting to MongoDB...');
        await dbConnect();
        console.log('✅ MongoDB connected\n');
        
        // 2. Initialize Firebase (checks connection & clears data)
        console.log('🔥 Initializing Firebase...');
        const firebaseConnected = await initializeFirebase();
        
        if (!firebaseConnected) {
            console.warn('⚠️  Firebase connection failed, but continuing...\n');
        }
        
        // 3. Start the server
        server.listen(3001, '0.0.0.0', () => {
            console.log('═══════════════════════════════════════');
            console.log('🌐 Server running on http://localhost:3001');
            console.log('🔌 WebSocket ready for connections');
            console.log('═══════════════════════════════════════\n');
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();