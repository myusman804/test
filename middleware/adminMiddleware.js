const checkIsAdmin = (email) => {
  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((email) =>
        email.trim().toLowerCase()
      )
    : [];
  return adminEmails.includes(email.toLowerCase());
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  try {
    // Check if user is authenticated first
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Double-check admin status against environment variable
    const isAdminByEmail = checkIsAdmin(req.user.email);
    const isAdminByToken = req.user.is_admin;

    // User must be admin both by token and by current environment config
    if (!isAdminByEmail || !isAdminByToken) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    // Add admin confirmation to request
    req.user.adminConfirmed = true;
    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking admin permissions",
    });
  }
};

// Middleware to optionally check admin status (doesn't block non-admins)
const checkAdminStatus = (req, res, next) => {
  try {
    if (req.user && req.user.email) {
      const isAdminByEmail = checkIsAdmin(req.user.email);
      req.user.is_admin = isAdminByEmail && req.user.is_admin;
      req.user.adminConfirmed = req.user.is_admin;
    }
    next();
  } catch (error) {
    console.error("Admin status check error:", error);
    next(); // Continue even if admin check fails
  }
};

module.exports = {
  requireAdmin,
  checkAdminStatus,
  checkIsAdmin,
};
