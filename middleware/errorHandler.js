// Enhanced error handling middleware with better logging and responses

// Custom error class for application errors
class AppError extends Error {
  constructor(message, statusCode, code = null, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }
}

// Error logging function
const logError = (err, req = null) => {
  const errorLog = {
    timestamp: new Date().toISOString(),
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      stack: err.stack,
      isOperational: err.isOperational,
    },
    request: req
      ? {
          method: req.method,
          url: req.originalUrl,
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get("User-Agent"),
          user: req.user
            ? {
                id: req.user.id,
                email: req.user.email,
              }
            : null,
        }
      : null,
    environment: process.env.NODE_ENV,
  };

  // Use appropriate log level based on error severity
  if (err.statusCode >= 500) {
    console.error("🚨 SERVER ERROR:", JSON.stringify(errorLog, null, 2));
  } else if (err.statusCode >= 400) {
    console.warn("⚠️  CLIENT ERROR:", JSON.stringify(errorLog, null, 2));
  } else {
    console.log("ℹ️  ERROR INFO:", JSON.stringify(errorLog, null, 2));
  }
};

// Main error handling middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  logError(err, req);

  let error = { ...err };
  error.message = err.message;

  // Set default values
  error.statusCode = error.statusCode || 500;
  error.code = error.code || "INTERNAL_ERROR";

  // MongoDB/Mongoose specific errors
  if (err.name === "CastError") {
    const message = "Resource not found - Invalid ID format";
    error = new AppError(message, 404, "INVALID_ID");
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    const value = Object.keys(err.keyValue || {})[0] || "value";
    const message = `Duplicate ${field}: '${value}' already exists`;
    error = new AppError(message, 409, "DUPLICATE_FIELD");
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((val) => ({
      field: val.path,
      message: val.message,
      value: val.value,
    }));

    const message = "Validation failed";
    error = new AppError(message, 400, "VALIDATION_ERROR");
    error.details = errors;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    const message = "Invalid authentication token";
    error = new AppError(message, 401, "INVALID_TOKEN");
  }

  if (err.name === "TokenExpiredError") {
    const message = "Authentication token has expired";
    error = new AppError(message, 401, "TOKEN_EXPIRED");
  }

  if (err.name === "NotBeforeError") {
    const message = "Token is not active yet";
    error = new AppError(message, 401, "TOKEN_NOT_ACTIVE");
  }

  // CORS errors
  if (err.message && err.message.includes("CORS")) {
    const message = "Cross-origin request not allowed";
    error = new AppError(message, 403, "CORS_ERROR");
  }

  // Rate limiting errors
  if (err.message && err.message.includes("rate limit")) {
    const message = "Too many requests. Please try again later";
    error = new AppError(message, 429, "RATE_LIMIT_EXCEEDED");
  }

  // File size errors
  if (err.code === "LIMIT_FILE_SIZE") {
    const message = "File size too large";
    error = new AppError(message, 413, "FILE_TOO_LARGE");
  }

  // Network/Connection errors
  if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
    const message = "External service unavailable";
    error = new AppError(message, 503, "SERVICE_UNAVAILABLE");
  }

  // Email service errors
  if (err.code === "EAUTH" || (err.message && err.message.includes("auth"))) {
    const message = "Email service authentication failed";
    error = new AppError(message, 502, "EMAIL_AUTH_FAILED");
  }

  // Build response object
  const response = {
    success: false,
    message: error.message || "An unexpected error occurred",
    code: error.code || "INTERNAL_ERROR",
    timestamp: new Date().toISOString(),
  };

  // Add additional error details in development
  if (process.env.NODE_ENV === "development") {
    response.debug = {
      stack: error.stack,
      name: error.name,
      originalError:
        err.name !== error.name
          ? {
              name: err.name,
              message: err.message,
            }
          : undefined,
    };
  }

  // Add validation errors if they exist
  if (error.details) {
    response.details = error.details;
  }

  // Add request ID for tracking (if available)
  if (req.id) {
    response.requestId = req.id;
  }

  // Send error response
  res.status(error.statusCode).json(response);
};

// 404 handler for undefined routes
const notFound = (req, res, next) => {
  const message = `Route not found: ${req.method} ${req.originalUrl}`;
  const error = new AppError(message, 404, "ROUTE_NOT_FOUND");

  // Add suggestion for similar routes
  const suggestions = getSimilarRoutes(req.originalUrl);
  if (suggestions.length > 0) {
    error.suggestions = suggestions;
  }

  next(error);
};

// Helper function to suggest similar routes
const getSimilarRoutes = (requestedPath) => {
  const commonRoutes = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/dashboard",
    "/api/referral/stats",
    "/api/referral/history",
    "/health",
    "/api",
  ];

  // Simple similarity check (you could make this more sophisticated)
  return commonRoutes
    .filter((route) => {
      const similarity = calculateSimilarity(
        requestedPath.toLowerCase(),
        route.toLowerCase()
      );
      return similarity > 0.5; // 50% similarity threshold
    })
    .slice(0, 3); // Return max 3 suggestions
};

// Simple string similarity function
const calculateSimilarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
};

// Levenshtein distance calculation
const getEditDistance = (str1, str2) => {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

// Async error wrapper for route handlers
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation error formatter
const formatValidationErrors = (errors) => {
  return errors.map((error) => ({
    field: error.param || error.path,
    message: error.msg || error.message,
    value: error.value,
    location: error.location,
  }));
};

// Health check error
const createHealthCheckError = (component, error) => {
  return new AppError(
    `Health check failed for ${component}: ${error.message}`,
    503,
    "HEALTH_CHECK_FAILED"
  );
};

module.exports = {
  errorHandler,
  notFound,
  AppError,
  asyncHandler,
  formatValidationErrors,
  createHealthCheckError,
  logError,
};
