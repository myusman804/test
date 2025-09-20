const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header("Authorization");

    // Check if no token
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "No token provided, authorization denied",
      });
    }

    // Extract the token part (remove "Bearer ")
    const tokenParts = authHeader.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return res.status(401).json({
        success: false,
        message: "Invalid token format. Expected 'Bearer <token>'",
      });
    }

    const token = tokenParts[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.user || !decoded.user.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload",
      });
    }

    req.user = {
      id: decoded.user.id,
      email: decoded.user.email,
      name: decoded.user.name,
      referralCode: decoded.user.referralCode,
      is_admin: decoded.user.is_admin || false, // Extract admin status from token
    };

    req.authTime = new Date();

    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired, please login again",
      });
    } else if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Token verification failed",
    });
  }
};
