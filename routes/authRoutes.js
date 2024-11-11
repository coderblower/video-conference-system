const express = require('express');
const router = express.Router();
const { register, login, profile } = require('../controllers/AuthController');
const isAuthenticated  = require('../middleware/authMiddleware')


// Routes for authentication
router.post('/register', register);
router.post('/login', login);
router.get('/profile', isAuthenticated, profile); // Requires JWT middleware

module.exports = router;
