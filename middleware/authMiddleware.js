const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Main authentication middleware
const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header("Authorization");

    // Check if authorization header exists
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No authorization header provided.",
        code: "NO_AUTH_HEADER",
      });
    }

    // Check if header starts with "Bearer "
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message:
          "Access denied. Invalid authorization format. Use 'Bearer <token>'.",
        code: "INVALID_AUTH_FORMAT",
      });
    }

    // Extract token (remove "Bearer " prefix)
    const token = authHeader.substring(7);

    if (!token || token.trim() === "") {
      return res.status(401).json({
        success: false,
        message: "Access denied. Token is missing or empty.",
        code: "MISSING_TOKEN",
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validate token structure
    if (!decoded.user || !decoded.user.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token structure. Token payload is malformed.",
        code: "INVALID_TOKEN_PAYLOAD",
      });
    }

    // Add user information to request object
    req.user = {
      id: decoded.user.id,
      email: decoded.user.email,
      name: decoded.user.name,
      referralCode: decoded.user.referralCode,
      is_admin: decoded.user.is_admin || false,
    };

    // Add authentication metadata
    req.authTime = new Date();
    req.tokenExp = new Date(decoded.exp * 1000);
    req.tokenIat = new Date(decoded.iat * 1000);

    // Log successful authentication (only in development)
    if (process.env.NODE_ENV === "development") {
      console.log(
        `🔐 Auth success: ${req.user.email} - ${req.method} ${req.path}`
      );
    }

    next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error.message);

    // Handle specific JWT errors with appropriate messages
    let message = "Authentication failed";
    let code = "AUTH_FAILED";

    if (error.name === "TokenExpiredError") {
      message = "Your session has expired. Please login again.";
      code = "TOKEN_EXPIRED";
    } else if (error.name === "JsonWebTokenError") {
      message = "Invalid authentication token.";
      code = "INVALID_TOKEN";
    } else if (error.name === "NotBeforeError") {
      message = "Token is not active yet.";
      code = "TOKEN_NOT_ACTIVE";
    } else if (error.message.includes("jwt malformed")) {
      message = "Malformed authentication token.";
      code = "MALFORMED_TOKEN";
    }

    return res.status(401).json({
      success: false,
      message,
      code,
      ...(process.env.NODE_ENV === "development" && {
        debug: {
          error: error.message,
          name: error.name,
        },
      }),
    });
  }
};

// Optional authentication middleware (doesn't require auth)
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    // If no auth header, continue without authentication
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      req.user = null;
      req.isAuthenticated = false;
      return next();
    }

    const token = authHeader.substring(7);

    if (!token || token.trim() === "") {
      req.user = null;
      req.isAuthenticated = false;
      return next();
    }

    // Try to verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.user && decoded.user.id) {
      req.user = {
        id: decoded.user.id,
        email: decoded.user.email,
        name: decoded.user.name,
        referralCode: decoded.user.referralCode,
        is_admin: decoded.user.is_admin || false,
      };
      req.isAuthenticated = true;
      req.authTime = new Date();
      req.tokenExp = new Date(decoded.exp * 1000);
    } else {
      req.user = null;
      req.isAuthenticated = false;
    }

    next();
  } catch (error) {
    // If token is invalid, continue without authentication
    req.user = null;
    req.isAuthenticated = false;
    next();
  }
};

// Middleware to check if user account is still active
const checkAccountStatus = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next();
    }

    // Fetch current user status from database
    const user = await User.findById(req.user.id).select("isActive isVerified");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found. Please login again.",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
        code: "ACCOUNT_DEACTIVATED",
      });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: "Your account is not verified. Please verify your email.",
        code: "ACCOUNT_NOT_VERIFIED",
        requiresVerification: true,
      });
    }

    // Update user object with current status
    req.user.isActive = user.isActive;
    req.user.isVerified = user.isVerified;

    next();
  } catch (error) {
    console.error("❌ Account status check error:", error);
    return res.status(500).json({
      success: false,
      message: "Error verifying account status",
      code: "ACCOUNT_CHECK_ERROR",
    });
  }
};

// Middleware to refresh token if it's close to expiry
const refreshTokenIfNeeded = (req, res, next) => {
  try {
    if (!req.user || !req.tokenExp) {
      return next();
    }

    const now = new Date();
    const timeUntilExpiry = req.tokenExp.getTime() - now.getTime();
    const hoursUntilExpiry = timeUntilExpiry / (1000 * 60 * 60);

    // If token expires in less than 2 hours, suggest refresh
    if (hoursUntilExpiry < 2 && hoursUntilExpiry > 0) {
      res.set("X-Token-Refresh-Suggested", "true");
      res.set("X-Token-Expires-At", req.tokenExp.toISOString());
    }

    next();
  } catch (error) {
    console.error("❌ Token refresh check error:", error);
    // Continue even if refresh check fails
    next();
  }
};

// Combined middleware that includes all checks
const fullAuth = [authMiddleware, checkAccountStatus, refreshTokenIfNeeded];

// Rate limiting aware auth (for sensitive endpoints)
const sensitiveAuth = (req, res, next) => {
  // Add rate limiting tracking
  const userKey = req.user ? req.user.id : req.ip;
  req.rateLimitKey = userKey;

  authMiddleware(req, res, next);
};

module.exports = authMiddleware;

// Export additional middleware options
module.exports.optionalAuth = optionalAuth;
module.exports.checkAccountStatus = checkAccountStatus;
module.exports.refreshTokenIfNeeded = refreshTokenIfNeeded;
module.exports.fullAuth = fullAuth;
module.exports.sensitiveAuth = sensitiveAuth;
