const { body, param, query, validationResult } = require("express-validator");

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};

const validateRegistration = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters")
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage("Name can only contain letters and spaces"),

  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),

  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters long")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      "Password must contain at least one lowercase letter, one uppercase letter, and one number"
    ),

  body("referralCode")
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Referral code must be between 3 and 20 characters")
    .isAlphanumeric()
    .withMessage("Referral code can only contain letters and numbers"),

  handleValidationErrors,
];

const validateLogin = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),
  body("password").notEmpty().withMessage("Password is required"),
  handleValidationErrors,
];

const validateOTP = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Please provide a valid email address"),
  body("otp")
    .isLength({ min: 6, max: 6 })
    .withMessage("OTP must be exactly 6 digits")
    .isNumeric()
    .withMessage("OTP must contain only numbers"),
  handleValidationErrors,
];

const validateReferralCode = [
  param("code")
    .notEmpty()
    .withMessage("Referral code is required")
    .isLength({ min: 3, max: 20 })
    .withMessage("Referral code must be between 3 and 20 characters")
    .isAlphanumeric()
    .withMessage("Referral code must be alphanumeric"),
  handleValidationErrors,
];

const validatePagination = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  handleValidationErrors,
];

module.exports = {
  validateRegistration,
  validateLogin,
  validateOTP,
  validateReferralCode,
  validatePagination,
  handleValidationErrors,
};
