// middleware/validation.js
exports.validateResendOTP = (req, res, next) => {
  const { email } = req.body;
  const errors = [];

  if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
    errors.push({
      field: "email",
      message: "Valid email is required",
      location: "body",
    });
  }

  if (errors.length) {
    return res.status(400).json({
      success: false,
      message: "Request validation failed",
      code: "VALIDATION_ERROR",
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  next();
};
