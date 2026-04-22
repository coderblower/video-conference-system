const express = require('express');
const controller = require('../controllers/CallingController');

const router = express.Router();

router.post('/devices/register', controller.registerDevice);
router.post('/devices/logout', controller.logoutDevice);
router.get('/presence', controller.getPresence);
router.get('/history/:userId', controller.getCallHistory);
router.get('/dashboard', controller.getDashboard);

module.exports = router;
