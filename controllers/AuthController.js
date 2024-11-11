const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const  User  = require('../models/User'); // Adjust to match your Sequelize model

// Register a new user
exports.register = async (req, res) => {
    try {
        console.log(req.body)
        const { username, email, password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }
        const saltRounds = 10;
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = await User.create({
            username,
            email,
            password: hashedPassword
        });

        // Send success response
        res.status(201).json({ message: 'User registered successfully', user: newUser });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// User login
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ where: { email } });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, 'secret', { expiresIn: '1h' });

        // Send response with token
        res.status(200).json({ message: 'Login successful', token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};

// Get user profile (requires authentication)
exports.profile = async (req, res) => {
    try {
        console.log(req.user);

        const user = await User.findByPk(req.user.userId); // Assuming userId is added to req by middleware
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.status(200).json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
};
