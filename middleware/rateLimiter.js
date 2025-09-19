const rateLimit = require("express-rate-limit");

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// General API rate limiter
const generalLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // limit each IP to 100 requests per windowMs
  "Too many requests from this IP, please try again later"
);

// Auth rate limiter (stricter for sensitive operations)
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // limit each IP to 5 requests per windowMs
  "Too many authentication attempts, please try again later"
);

// OTP rate limiter (very strict)
const otpLimiter = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  3, // limit each IP to 3 requests per windowMs
  "Too many OTP requests, please wait before trying again"
);

module.exports = {
  generalLimiter,
  authLimiter,
  otpLimiter,
};
