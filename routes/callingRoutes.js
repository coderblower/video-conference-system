const express = require('express');
const controller = require('../controllers/CallingController');

const router = express.Router();

router.post('/devices/register', controller.registerDevice);
router.post('/devices/logout', controller.logoutDevice);
router.get('/presence', controller.getPresence);
router.get('/history/:userId', controller.getCallHistory);
router.get('/dashboard', controller.getDashboard);
router.post('/ringing', controller.reportRinging);
router.post('/decline', controller.reportDecline);
router.post('/accept', controller.reportAccept);
router.post('/timeout', controller.reportTimeout);
router.get('/status/:roomId', controller.getCallStatus);

module.exports = router;
