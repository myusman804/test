const rateLimit = require("express-rate-limit");

// Configuration constants from environment variables
const RATE_LIMIT_WINDOW_MINUTES =
  parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES) || 15;
const RATE_LIMIT_MAX_REQUESTS =
  parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;
const AUTH_RATE_LIMIT_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5;
const OTP_RATE_LIMIT_MAX = parseInt(process.env.OTP_RATE_LIMIT_MAX) || 3;

// Enhanced rate limit message generator
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

// Enhanced key generator that considers user authentication
const createKeyGenerator = (prefix = "") => {
  return (req) => {
    // Use user ID if authenticated, otherwise fall back to IP
    const userKey =
      req.user && req.user.id ? `user:${req.user.id}` : `ip:${req.ip}`;
    return prefix ? `${prefix}:${userKey}` : userKey;
  };
};

// Skip function for trusted IPs or certain conditions
const createSkipFunction = (trustedIPs = []) => {
  return (req) => {
    // Skip rate limiting for trusted IPs (like load balancers, monitoring)
    if (trustedIPs.includes(req.ip)) {
      return true;
    }

    // Skip for health checks
    if (req.path === "/health" && req.method === "GET") {
      return true;
    }

    // Skip for certain admin operations (if needed)
    if (
      req.user &&
      req.user.is_admin &&
      process.env.SKIP_RATE_LIMIT_FOR_ADMIN === "true"
    ) {
      return true;
    }

    return false;
  };
};

// Enhanced rate limiter factory
const createRateLimiter = (options = {}) => {
  const {
    windowMs = RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max = RATE_LIMIT_MAX_REQUESTS,
    message = "Too many requests",
    keyPrefix = "",
    trustedIPs = [],
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
    keyGenerator: createKeyGenerator(keyPrefix),
    skip: createSkipFunction(trustedIPs),
    skipSuccessfulRequests,
    skipFailedRequests,

    // Custom handler for when rate limit is exceeded
    handler: (req, res) => {
      const retryAfter = Math.round(windowMs / 1000);

      // Log rate limit violation
      console.warn(
        `🚫 Rate limit exceeded: ${req.ip} - ${req.method} ${req.path}`,
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

    // Custom store configuration (you can add Redis store for production)
    // store: new RedisStore({...}) for production use
  });
};

// General API rate limiter (applied to all routes)
const generalLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: RATE_LIMIT_MAX_REQUESTS,
  keyPrefix: "general",
  message: "Too many requests from this IP, please try again later",
  skipSuccessfulRequests: false,
  trustedIPs: process.env.TRUSTED_IPS ? process.env.TRUSTED_IPS.split(",") : [],
});

// Authentication rate limiter (stricter for login/register)
const authLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: AUTH_RATE_LIMIT_MAX,
  keyPrefix: "auth",
  message: "Too many authentication attempts, please try again later",
  skipSuccessfulRequests: true, // Don't count successful logins against the limit
});

// OTP rate limiter (very strict for OTP operations)
const otpLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: OTP_RATE_LIMIT_MAX,
  keyPrefix: "otp",
  message: "Too many OTP requests, please wait before trying again",
  skipSuccessfulRequests: false,
});

// Password reset rate limiter
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyPrefix: "password-reset",
  message: "Too many password reset attempts, please try again later",
});

// Admin operations rate limiter
const adminLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Higher limit for admin operations
  keyPrefix: "admin",
  message: "Too many admin requests, please slow down",
});

// File upload rate limiter
const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  keyPrefix: "upload",
  message: "Too many upload attempts, please try again later",
});

// API documentation rate limiter (more lenient)
const docsLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyPrefix: "docs",
  message: "Too many documentation requests",
});

// Referral operations rate limiter
const referralLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  keyPrefix: "referral",
  message: "Too many referral requests, please slow down",
  skipSuccessfulRequests: true,
});

// Search/query rate limiter
const searchLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyPrefix: "search",
  message: "Too many search requests, please slow down",
});

// Progressive rate limiter that gets stricter with repeated violations
const createProgressiveLimiter = (baseOptions = {}) => {
  const violationCounts = new Map();

  return (req, res, next) => {
    const key = createKeyGenerator("progressive")(req);
    const violations = violationCounts.get(key) || 0;

    // Increase strictness based on previous violations
    const adjustedMax = Math.max(1, baseOptions.max - violations * 2);
    const adjustedWindow = baseOptions.windowMs * (1 + violations * 0.5);

    const limiter = createRateLimiter({
      ...baseOptions,
      max: adjustedMax,
      windowMs: adjustedWindow,
      handler: (req, res) => {
        // Increment violation count
        violationCounts.set(key, violations + 1);

        // Clean up old entries periodically
        if (violationCounts.size > 1000) {
          const entries = Array.from(violationCounts.entries());
          entries.slice(0, 500).forEach(([k]) => violationCounts.delete(k));
        }

        console.warn(
          `🔥 Progressive rate limit violation #${violations + 1}: ${key}`,
          {
            violations: violations + 1,
            adjustedMax,
            adjustedWindow: Math.round(adjustedWindow / 1000),
          }
        );

        const retryAfter = Math.round(adjustedWindow / 1000);
        res
          .status(429)
          .json(
            createRateLimitMessage(adjustedWindow, adjustedMax, retryAfter)
          );
      },
    });

    limiter(req, res, next);
  };
};

// Create progressive limiter for repeat offenders
const progressiveAuthLimiter = createProgressiveLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes base
  max: 5, // 5 attempts base
});

// Rate limiter for sensitive operations (account changes, etc.)
const sensitiveLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5,
  keyPrefix: "sensitive",
  message: "Too many sensitive operations, please wait before trying again",
  skipSuccessfulRequests: false,
});

// Middleware to add rate limit info to response headers
const addRateLimitInfo = (req, res, next) => {
  const originalSend = res.send;

  res.send = function (data) {
    // Add custom rate limit headers
    if (req.rateLimit) {
      res.set("X-RateLimit-Limit", req.rateLimit.limit);
      res.set("X-RateLimit-Remaining", req.rateLimit.remaining);
      res.set(
        "X-RateLimit-Reset",
        new Date(Date.now() + req.rateLimit.msBeforeNext).toISOString()
      );
    }

    return originalSend.call(this, data);
  };

  next();
};

// Function to reset rate limit for a specific key (for admin use)
const resetRateLimit = async (key, store = null) => {
  try {
    if (store && typeof store.resetKey === "function") {
      await store.resetKey(key);
      return { success: true, message: `Rate limit reset for key: ${key}` };
    } else {
      return {
        success: false,
        message: "Rate limit store not available for reset",
      };
    }
  } catch (error) {
    console.error("❌ Error resetting rate limit:", error);
    return {
      success: false,
      message: "Failed to reset rate limit",
      error: error.message,
    };
  }
};

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
  addRateLimitInfo,
  createRateLimiter,
  createProgressiveLimiter,
  resetRateLimit,
};
