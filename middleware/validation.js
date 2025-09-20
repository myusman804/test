const { body, param, query, validationResult } = require("express-validator");
const validator = require("validator");

// Enhanced validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((error) => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
      location: error.location,
    }));

    // Log validation failures for monitoring
    console.warn(`🔍 Validation failed: ${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      errors: formattedErrors,
      body: process.env.NODE_ENV === "development" ? req.body : "[HIDDEN]",
    });

    return res.status(400).json({
      success: false,
      message: "Request validation failed",
      code: "VALIDATION_ERROR",
      errors: formattedErrors,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

// Custom validators
const customValidators = {
  // Check if password meets strength requirements
  isStrongPassword: (value) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasNonalphas = /\W/.test(value);

    return (
      value.length >= minLength &&
      hasUpperCase &&
      hasLowerCase &&
      hasNumbers &&
      hasNonalphas
    );
  },

  // Check if referral code format is valid
  isValidReferralCode: (value) => {
    return /^[A-Z0-9]{6,20}$/.test(value.toUpperCase());
  },

  // Check if name contains only letters and spaces
  isValidName: (value) => {
    return /^[a-zA-Z\s]+$/.test(value.trim());
  },

  // Check if value is a valid ObjectId
  isValidObjectId: (value) => {
    return /^[0-9a-fA-F]{24}$/.test(value);
  },

  // Check if email domain is allowed
  isAllowedEmailDomain: (value) => {
    const blockedDomains = (process.env.BLOCKED_EMAIL_DOMAINS || "")
      .split(",")
      .map((d) => d.trim().toLowerCase());
    if (blockedDomains.length === 0) return true;

    const domain = value.split("@")[1]?.toLowerCase();
    return !blockedDomains.includes(domain);
  },

  // Check if value is within reasonable length
  isReasonableLength: (value, min = 1, max = 1000) => {
    return value && value.length >= min && value.length <= max;
  },
};

// Registration validation with enhanced security
const validateRegistration = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters")
    .custom(customValidators.isValidName)
    .withMessage("Name can only contain letters and spaces")
    .customSanitizer((value) => value.replace(/\s+/g, " ").trim()), // Clean up extra spaces

  body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail({
      gmail_remove_dots: false, // Keep dots in Gmail addresses
      outlookdotcom_remove_subaddress: false,
    })
    .isLength({ max: 320 }) // RFC 5321 email length limit
    .withMessage("Email address is too long")
    .custom(customValidators.isAllowedEmailDomain)
    .withMessage("Email domain is not allowed"),

  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .custom(customValidators.isStrongPassword)
    .withMessage(
      "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
    ),

  body("referralCode")
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Referral code must be between 3 and 20 characters")
    .custom(customValidators.isValidReferralCode)
    .withMessage("Referral code can only contain letters and numbers")
    .toUpperCase(),

  // Optional terms acceptance validation
  body("acceptTerms")
    .optional()
    .isBoolean()
    .withMessage("Terms acceptance must be a boolean value"),

  handleValidationErrors,
];

// Login validation
const validateLogin = [
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail()
    .isLength({ max: 320 })
    .withMessage("Email address is too long"),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 1, max: 128 })
    .withMessage("Password length is invalid"),

  // Optional remember me validation
  body("rememberMe")
    .optional()
    .isBoolean()
    .withMessage("Remember me must be a boolean value"),

  handleValidationErrors,
];

// OTP validation with enhanced security
// Updated OTP validation in middleware/validation.js
// Replace the existing validateOTP array with this:

const validateOTP = [
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  body("otp")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be exactly 6 digits")
    .isNumeric()
    .withMessage("OTP must contain only numbers")
    .custom((value) => {
      // Only reject obvious fake patterns, but allow natural repetition
      const isAllSame = /^(\d)\1{5}$/.test(value); // All same digit (111111)
      const isSimpleSequence = /^123456$|^654321$/.test(value); // Only basic sequences

      if (isAllSame || isSimpleSequence) {
        throw new Error("Invalid OTP format");
      }
      return true;
    }),

  handleValidationErrors,
];

// Password reset validation
const validatePasswordReset = [
  body("email")
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail(),

  handleValidationErrors,
];

// Password change validation
const validatePasswordChange = [
  body("currentPassword")
    .notEmpty()
    .withMessage("Current password is required"),

  body("newPassword")
    .isLength({ min: 8, max: 128 })
    .withMessage("New password must be between 8 and 128 characters")
    .custom(customValidators.isStrongPassword)
    .withMessage("New password must meet strength requirements"),

  body("confirmPassword").custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error("Password confirmation does not match");
    }
    return true;
  }),

  handleValidationErrors,
];

// Referral code validation
const validateReferralCode = [
  param("code")
    .notEmpty()
    .withMessage("Referral code is required")
    .isLength({ min: 3, max: 20 })
    .withMessage("Referral code must be between 3 and 20 characters")
    .custom(customValidators.isValidReferralCode)
    .withMessage("Invalid referral code format")
    .toUpperCase(),

  handleValidationErrors,
];

// Pagination validation with reasonable limits
const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage("Page must be a positive integer (max 10,000)")
    .toInt(),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100")
    .toInt(),

  query("sortBy")
    .optional()
    .isIn(["createdAt", "updatedAt", "name", "email", "referralCount", "coins"])
    .withMessage("Invalid sort field"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc"])
    .withMessage("Sort order must be 'asc' or 'desc'"),

  handleValidationErrors,
];

// Search validation
const validateSearch = [
  query("q")
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search query must be between 1 and 100 characters")
    .trim()
    .escape(), // Prevent XSS

  query("filter")
    .optional()
    .isIn(["all", "verified", "unverified", "active", "inactive"])
    .withMessage("Invalid filter option"),

  handleValidationErrors,
];

// User ID validation
const validateUserId = [
  param("id")
    .custom(customValidators.isValidObjectId)
    .withMessage("Invalid user ID format"),

  handleValidationErrors,
];

// Profile update validation
const validateProfileUpdate = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters")
    .custom(customValidators.isValidName)
    .withMessage("Name can only contain letters and spaces"),

  body("email")
    .optional()
    .isEmail()
    .withMessage("Please provide a valid email address")
    .normalizeEmail()
    .custom(customValidators.isAllowedEmailDomain)
    .withMessage("Email domain is not allowed"),

  // Ensure at least one field is provided
  body().custom((value, { req }) => {
    const allowedFields = ["name", "email"];
    const providedFields = allowedFields.filter(
      (field) => req.body[field] !== undefined
    );

    if (providedFields.length === 0) {
      throw new Error("At least one field must be provided for update");
    }
    return true;
  }),

  handleValidationErrors,
];

// Admin operations validation
const validateAdminUserUpdate = [
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean value"),

  body("isVerified")
    .optional()
    .isBoolean()
    .withMessage("isVerified must be a boolean value"),

  body("coins")
    .optional()
    .isInt({ min: 0, max: 999999999 })
    .withMessage("Coins must be a non-negative integer (max 999,999,999)"),

  body("role")
    .optional()
    .isIn(["user", "admin", "superadmin"])
    .withMessage("Invalid role specified"),

  handleValidationErrors,
];

// Bulk operations validation
const validateBulkOperation = [
  body("userIds")
    .isArray({ min: 1, max: 100 })
    .withMessage("userIds must be an array with 1-100 items")
    .custom((userIds) => {
      return userIds.every((id) => customValidators.isValidObjectId(id));
    })
    .withMessage("All user IDs must be valid ObjectIds"),

  body("operation")
    .isIn(["activate", "deactivate", "verify", "delete"])
    .withMessage("Invalid operation specified"),

  handleValidationErrors,
];

// Analytics query validation
const validateAnalyticsQuery = [
  query("startDate")
    .optional()
    .isISO8601()
    .withMessage("Start date must be a valid ISO 8601 date")
    .toDate(),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("End date must be a valid ISO 8601 date")
    .toDate(),

  query("period")
    .optional()
    .isIn(["day", "week", "month", "year"])
    .withMessage("Period must be one of: day, week, month, year"),

  // Ensure end date is after start date
  query("endDate")
    .optional()
    .custom((endDate, { req }) => {
      const startDate = req.query.startDate;
      if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
        throw new Error("End date must be after start date");
      }
      return true;
    }),

  handleValidationErrors,
];

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Remove any undefined or null values from request body
  if (req.body && typeof req.body === "object") {
    Object.keys(req.body).forEach((key) => {
      if (req.body[key] === undefined || req.body[key] === null) {
        delete req.body[key];
      }

      // Trim string values
      if (typeof req.body[key] === "string") {
        req.body[key] = req.body[key].trim();
      }
    });
  }

  next();
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateOTP,
  validatePasswordReset,
  validatePasswordChange,
  validateReferralCode,
  validatePagination,
  validateSearch,
  validateUserId,
  validateProfileUpdate,
  validateAdminUserUpdate,
  validateBulkOperation,
  validateAnalyticsQuery,
  handleValidationErrors,
  sanitizeInput,
  customValidators,
};
