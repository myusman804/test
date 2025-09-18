
const express = require('express');
const { register, verifyOTP, resendOTP, login, logout, dashboard } = require('../controllers/authController');
const authMiddleware = require('../middleware/authmiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/login', login);
router.post('/logout', logout);
router.get('/dashboard', authMiddleware, dashboard);

module.exports = router;