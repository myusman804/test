const rateLimit = require("express-rate-limit");

// Configuration constants from environment variables
const RATE_LIMIT_WINDOW_MINUTES =
  parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15;
const RATE_LIMIT_MAX_REQUESTS =
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
const AUTH_RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5;
const OTP_RATE_LIMIT_MAX = parseInt(process.env.OTP_RATE_LIMIT_MAX) || 3;

// Simple rate limit message generator
const createRateLimitMessage = (windowMs, max, retryAfter) => {
  const windowMinutes = Math.ceil(windowMs / (1000 * 60));
  const retryMinutes = Math.ceil(retryAfter / 60);

  return {
    success: false,
    message: `Rate limit exceeded. Maximum ${max} requests allowed per ${windowMinutes} minutes.`,
    code: "RATE_LIMIT_EXCEEDED",
    details: {
      limit: max,
      windowMinutes,
      retryAfter: retryAfter,
      retryAfterMinutes: retryMinutes,
    },
    timestamp: new Date().toISOString(),
  };
};

// Simple rate limiter factory - no custom keyGenerator to avoid IPv6 issues
const createRateLimiter = (options = {}) => {
  const {
    windowMs = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max = RATE_LIMIT_MAX_REQUESTS,
    message = "Too many requests",
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: (req, res) =>
      createRateLimitMessage(windowMs, max, res.getHeader("Retry-After")),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,

    // Skip function for health checks and trusted scenarios
    skip: (req) => {
      // Skip for health checks
      if (req.path === "/health" && req.method === "GET") {
        return true;
      }

      // Skip for certain admin operations if configured
      if (
        req.user &&
        req.user.is_admin &&
        process.env.SKIP_RATE_LIMIT_FOR_ADMIN === "true"
      ) {
        return true;
      }

      return false;
    },

    // Custom handler for when rate limit is exceeded
    handler: (req, res) => {
      const retryAfter = Math.round(windowMs / 1000);

      // Log rate limit violation
      console.warn(
        `Rate limit exceeded: ${req.ip} - ${req.method} ${req.path}`,
        {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          path: req.path,
          method: req.method,
          user: req.user ? req.user.email : "anonymous",
          timestamp: new Date().toISOString(),
        }
      );

      res.status(429).json(createRateLimitMessage(windowMs, max, retryAfter));
    },
  });
};

// General API rate limiter (applied to all routes)
const generalLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: "Too many requests from this IP, please try again later",
  skipSuccessfulRequests: false,
});

// Authentication rate limiter (stricter for login/register)
const authLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: AUTH_RATE_LIMIT_MAX,
  message: "Too many authentication attempts, please try again later",
  skipSuccessfulRequests: true,
});

// OTP rate limiter (very strict for OTP operations)
const otpLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: OTP_RATE_LIMIT_MAX,
  message: "Too many OTP requests, please wait before trying again",
  skipSuccessfulRequests: false,
});

// Password reset rate limiter
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: "Too many password reset attempts, please try again later",
});

// Admin operations rate limiter
const adminLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: "Too many admin requests, please slow down",
});

// File upload rate limiter
const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  message: "Too many upload attempts, please try again later",
});

// API documentation rate limiter (more lenient)
const docsLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: "Too many documentation requests",
});

// Referral operations rate limiter
const referralLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  message: "Too many referral requests, please slow down",
  skipSuccessfulRequests: true,
});

// Search/query rate limiter
const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: "Too many search requests, please slow down",
});

// Rate limiter for sensitive operations
const sensitiveLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5,
  message: "Too many sensitive operations, please wait before trying again",
  skipSuccessfulRequests: false,
});

// Simple progressive limiter
const progressiveAuthLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Very strict for progressive limiting
  message: "Too many failed attempts, account temporarily restricted",
});

module.exports = {
  generalLimiter,
  authLimiter,
  otpLimiter,
  passwordResetLimiter,
  adminLimiter,
  uploadLimiter,
  docsLimiter,
  referralLimiter,
  searchLimiter,
  sensitiveLimiter,
  progressiveAuthLimiter,
  createRateLimiter,
};
