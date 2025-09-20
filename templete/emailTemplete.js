// Enhanced email template functions with better design and security

const createVerificationEmailHTML = (name, otp) => {
  // Validate inputs
  if (!name || !otp) {
    throw new Error("Name and OTP are required for email template");
  }

  // Sanitize inputs to prevent XSS
  const safeName = String(name).replace(/[<>&"']/g, (match) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[match];
  });

  const safeOTP = String(otp).replace(/[^0-9]/g, "");

  if (safeOTP.length !== 6) {
    throw new Error("Invalid OTP format");
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Email Verification - AdsMoney</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style type="text/css">
        /* Reset styles */
        body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        
        /* Responsive styles */
        @media only screen and (max-width: 640px) {
            .container { width: 100% !important; max-width: 100% !important; }
            .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .mobile-center { text-align: center !important; }
            .otp-code { font-size: 28px !important; letter-spacing: 4px !important; }
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            .dark-bg { background-color: #1a1a1a !important; }
            .dark-text { color: #ffffff !important; }
            .dark-card { background-color: #2d2d2d !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6;">
    <!-- Preheader text -->
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
        Your AdsMoney verification code is ${safeOTP}. This code expires in 10 minutes.
    </div>
    
    <!-- Main container -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; min-height: 100vh;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <!-- Email wrapper -->
                <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
                    
                    <!-- Header with gradient -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 40px; text-align: center; position: relative;">
                            <!-- Logo placeholder -->
                            <div style="background-color: rgba(255, 255, 255, 0.2); width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">💰</span>
                            </div>
                            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0; letter-spacing: -0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                AdsMoney
                            </h1>
                            <p style="color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 10px 0 0; font-weight: 400;">
                                Your financial growth partner
                            </p>
                        </td>
                    </tr>

                    <!-- Main content -->
                    <tr>
                        <td class="mobile-padding" style="padding: 50px 40px;">
                            <!-- Welcome message -->
                            <div style="text-align: center; margin-bottom: 40px;">
                                <h2 style="font-size: 28px; font-weight: 600; color: #1a202c; margin-bottom: 16px; line-height: 1.3;">
                                    🎉 Welcome to AdsMoney!
                                </h2>
                                <p style="font-size: 18px; color: #4a5568; margin-bottom: 0; line-height: 1.5;">
                                    Hi <strong style="color: #2d3748;">${safeName}</strong>! We're excited to have you join our community.
                                </p>
                            </div>

                            <!-- Verification instruction -->
                            <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-radius: 12px; padding: 30px; margin-bottom: 40px; border: 1px solid #e2e8f0;">
                                <p style="font-size: 16px; color: #2d3748; margin: 0 0 20px; text-align: center; font-weight: 500;">
                                    To complete your registration and start earning, please verify your email address using the code below:
                                </p>
                            </div>

                            <!-- OTP display -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 40px;">
                                <tr>
                                    <td align="center">
                                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px; padding: 40px 30px; display: inline-block; box-shadow: 0 8px 25px rgba(102, 126, 234, 0.25);">
                                            <p style="font-size: 14px; color: rgba(255, 255, 255, 0.8); margin: 0 0 15px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">
                                                Your Verification Code
                                            </p>
                                            <div class="otp-code" style="font-size: 42px; font-weight: 800; color: #ffffff; letter-spacing: 8px; font-family: 'Courier New', Consolas, monospace; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                                ${safeOTP}
                                            </div>
                                            <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin: 15px 0 0; font-weight: 400;">
                                                Valid for 10 minutes
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Security notice -->
                            <div style="background-color: #fef5e7; border-left: 4px solid #f6ad55; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <div style="display: flex; align-items: flex-start;">
                                    <span style="color: #ed8936; font-size: 18px; margin-right: 12px;">🔒</span>
                                    <div>
                                        <p style="font-size: 14px; color: #744210; margin: 0; font-weight: 600; line-height: 1.5;">
                                            Security Notice
                                        </p>
                                        <p style="font-size: 14px; color: #744210; margin: 8px 0 0; line-height: 1.5;">
                                            This code will expire in <strong>10 minutes</strong>. If you didn't create an AdsMoney account, please ignore this email and consider changing your passwords if you suspect unauthorized access.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- CTA and instructions -->
                            <div style="text-align: center; margin-bottom: 30px;">
                                <p style="font-size: 16px; color: #4a5568; margin-bottom: 20px;">
                                    Enter this code in the verification form to activate your account and start your journey with AdsMoney.
                                </p>
                                
                                <!-- Benefits preview -->
                                <div style="background-color: #f7fafc; border-radius: 12px; padding: 25px; margin: 25px 0;">
                                    <p style="font-size: 16px; color: #2d3748; margin: 0 0 15px; font-weight: 600;">
                                        🚀 What's waiting for you:
                                    </p>
                                    <div style="text-align: left; max-width: 400px; margin: 0 auto;">
                                        <p style="font-size: 14px; color: #4a5568; margin: 8px 0; line-height: 1.5;">
                                            ✨ Start earning with our referral program
                                        </p>
                                        <p style="font-size: 14px; color: #4a5568; margin: 8px 0; line-height: 1.5;">
                                            💰 Get ${
                                              process.env
                                                .REFERRAL_REWARD_COINS || 10
                                            } coins for each successful referral
                                        </p>
                                        <p style="font-size: 14px; color: #4a5568; margin: 8px 0; line-height: 1.5;">
                                            📊 Track your progress on your personal dashboard
                                        </p>
                                        <p style="font-size: 14px; color: #4a5568; margin: 8px 0; line-height: 1.5;">
                                            🏆 Compete on our leaderboard
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Support information -->
                            <div style="text-align: center; padding: 20px; background-color: #f7fafc; border-radius: 8px;">
                                <p style="font-size: 14px; color: #718096; margin: 0 0 10px;">
                                    Need help? Our support team is here for you.
                                </p>
                                <p style="font-size: 14px; margin: 0;">
                                    <a href="mailto:${
                                      process.env.EMAIL_USER
                                    }" style="color: #667eea; text-decoration: none; font-weight: 500;">
                                        ${process.env.EMAIL_USER}
                                    </a>
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="font-size: 14px; color: #718096; margin: 0 0 15px;">
                                © ${new Date().getFullYear()} AdsMoney. All rights reserved.
                            </p>
                            <p style="font-size: 12px; color: #a0aec0; margin: 0 0 15px; line-height: 1.5;">
                                This email was sent to verify your account registration.<br>
                                If you didn't sign up for AdsMoney, you can safely ignore this email.
                            </p>
                            <div style="margin-top: 20px;">
                                <a href="#" style="color: #718096; text-decoration: none; font-size: 12px; margin: 0 10px;">Privacy Policy</a>
                                <span style="color: #cbd5e0;">|</span>
                                <a href="#" style="color: #718096; text-decoration: none; font-size: 12px; margin: 0 10px;">Terms of Service</a>
                                <span style="color: #cbd5e0;">|</span>
                                <a href="#" style="color: #718096; text-decoration: none; font-size: 12px; margin: 0 10px;">Contact Us</a>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
};

const createResendOTPEmailHTML = (name, otp) => {
  // Validate inputs
  if (!name || !otp) {
    throw new Error("Name and OTP are required for email template");
  }

  // Sanitize inputs
  const safeName = String(name).replace(/[<>&"']/g, (match) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[match];
  });

  const safeOTP = String(otp).replace(/[^0-9]/g, "");

  if (safeOTP.length !== 6) {
    throw new Error("Invalid OTP format");
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>New Verification Code - AdsMoney</title>
    <style type="text/css">
        body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
        
        @media only screen and (max-width: 640px) {
            .container { width: 100% !important; max-width: 100% !important; }
            .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .mobile-center { text-align: center !important; }
            .otp-code { font-size: 28px !important; letter-spacing: 4px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f0fdf4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <!-- Preheader -->
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
        Your new AdsMoney verification code is ${safeOTP}. Previous code has been replaced.
    </div>
    
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f0fdf4; min-height: 100vh;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(34, 197, 94, 0.15); border: 1px solid #dcfce7;">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 50px 40px; text-align: center;">
                            <div style="background-color: rgba(255, 255, 255, 0.2); width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                                <span style="color: #ffffff; font-size: 24px;">🔄</span>
                            </div>
                            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                AdsMoney
                            </h1>
                            <p style="color: rgba(255, 255, 255, 0.9); font-size: 16px; margin: 10px 0 0;">
                                New verification code ready
                            </p>
                        </td>
                    </tr>

                    <!-- Main content -->
                    <tr>
                        <td class="mobile-padding" style="padding: 50px 40px;">
                            <div style="text-align: center; margin-bottom: 40px;">
                                <h2 style="font-size: 28px; font-weight: 600; color: #1a202c; margin-bottom: 16px;">
                                    🔄 New Verification Code
                                </h2>
                                <p style="font-size: 18px; color: #4a5568; line-height: 1.5;">
                                    Hi <strong style="color: #2d3748;">${safeName}</strong>! Here's your new verification code as requested.
                                </p>
                            </div>

                            <!-- OTP display -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 40px;">
                                <tr>
                                    <td align="center">
                                        <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); border-radius: 16px; padding: 40px 30px; display: inline-block; box-shadow: 0 8px 25px rgba(5, 150, 105, 0.25);">
                                            <p style="font-size: 14px; color: rgba(255, 255, 255, 0.8); margin: 0 0 15px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">
                                                Your New Code
                                            </p>
                                            <div class="otp-code" style="font-size: 42px; font-weight: 800; color: #ffffff; letter-spacing: 8px; font-family: 'Courier New', monospace; text-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                                ${safeOTP}
                                            </div>
                                            <p style="font-size: 12px; color: rgba(255, 255, 255, 0.7); margin: 15px 0 0;">
                                                Expires in 10 minutes
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Important notice -->
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
                                <div style="display: flex; align-items: flex-start;">
                                    <span style="color: #d97706; font-size: 18px; margin-right: 12px;">⚠️</span>
                                    <div>
                                        <p style="font-size: 14px; color: #92400e; margin: 0; font-weight: 600;">
                                            Important Notice
                                        </p>
                                        <p style="font-size: 14px; color: #92400e; margin: 8px 0 0; line-height: 1.5;">
                                            This new code replaces your previous verification code. The old code is no longer valid.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div style="text-align: center;">
                                <p style="font-size: 16px; color: #4a5568; margin-bottom: 20px;">
                                    Enter this code in the verification form to complete your registration.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f0fdf4; padding: 40px; text-align: center; border-top: 1px solid #dcfce7;">
                            <p style="font-size: 14px; color: #065f46; margin: 0 0 10px;">
                                © ${new Date().getFullYear()} AdsMoney. All rights reserved.
                            </p>
                            <p style="font-size: 12px; color: #059669; margin: 0;">
                                This is a new verification code. Your previous code has been deactivated.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
  `;
};

// Welcome email template for verified users
const createWelcomeEmailHTML = (name, referralCode) => {
  const safeName = String(name).replace(/[<>&"']/g, (match) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[match];
  });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const referralLink = `${frontendUrl}/register?ref=${referralCode}`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to AdsMoney!</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 50px 40px; text-align: center; border-radius: 16px 16px 0 0;">
                            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0;">
                                🎉 Welcome to AdsMoney!
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 50px 40px; text-align: center;">
                            <h2 style="color: #1a202c; font-size: 24px; margin-bottom: 20px;">
                                Congratulations, ${safeName}!
                            </h2>
                            <p style="color: #4a5568; font-size: 18px; line-height: 1.6; margin-bottom: 30px;">
                                Your account is now verified and ready to start earning! 
                            </p>
                            
                            <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-radius: 12px; padding: 30px; margin: 30px 0;">
                                <h3 style="color: #2d3748; font-size: 20px; margin-bottom: 20px;">
                                    🚀 Your Referral Code
                                </h3>
                                <div style="background-color: #667eea; color: white; padding: 20px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 2px; font-family: monospace;">
                                    ${referralCode}
                                </div>
                                <p style="color: #4a5568; font-size: 14px; margin: 15px 0 0;">
                                    Share this code and earn ${
                                      process.env.REFERRAL_REWARD_COINS || 10
                                    } coins for each successful referral!
                                </p>
                            </div>

                            <div style="margin: 30px 0;">
                                <a href="${referralLink}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    Start Referring Now
                                </a>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

// Password reset email template
const createPasswordResetEmailHTML = (name, resetToken, resetUrl) => {
  const safeName = String(name).replace(/[<>&"']/g, (match) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[match];
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - AdsMoney</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fef2f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(239, 68, 68, 0.15);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); padding: 50px 40px; text-align: center; border-radius: 16px 16px 0 0;">
                            <div style="background-color: rgba(255, 255, 255, 0.2); width: 60px; height: 60px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                                <span style="color: #ffffff; font-size: 24px;">🔐</span>
                            </div>
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0;">
                                Password Reset Request
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 50px 40px;">
                            <h2 style="color: #1a202c; font-size: 24px; text-align: center; margin-bottom: 20px;">
                                Hi ${safeName}!
                            </h2>
                            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
                                We received a request to reset your AdsMoney account password. If you made this request, click the button below to reset your password:
                            </p>
                            
                            <div style="text-align: center; margin: 40px 0;">
                                <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    Reset My Password
                                </a>
                            </div>

                            <div style="background-color: #fef2f2; border-left: 4px solid #f87171; padding: 20px; border-radius: 8px; margin: 30px 0;">
                                <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 600;">
                                    🚨 Security Notice
                                </p>
                                <p style="color: #991b1b; font-size: 14px; margin: 8px 0 0; line-height: 1.5;">
                                    This link will expire in 1 hour for security reasons. If you didn't request this password reset, please ignore this email and consider changing your password if you suspect unauthorized access.
                                </p>
                            </div>

                            <p style="color: #718096; font-size: 14px; text-align: center; margin-top: 40px;">
                                If the button doesn't work, copy and paste this link into your browser:<br>
                                <a href="${resetUrl}" style="color: #dc2626; word-break: break-all;">${resetUrl}</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <td style="background-color: #fef2f2; padding: 30px; text-align: center; border-top: 1px solid #fecaca;">
                            <p style="color: #991b1b; font-size: 12px; margin: 0;">
                                © ${new Date().getFullYear()} AdsMoney. This is a security email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

// Referral success notification email
const createReferralSuccessEmailHTML = (
  referrerName,
  referredName,
  coinsEarned
) => {
  const safeReferrerName = String(referrerName).replace(/[<>&"']/g, (match) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[match];
  });

  const safeReferredName = String(referredName).replace(/[<>&"']/g, (match) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[match];
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Referral Success! - AdsMoney</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f0fdf4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 16px; box-shadow: 0 10px 25px rgba(34, 197, 94, 0.15);">
                    <tr>
                        <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 50px 40px; text-align: center; border-radius: 16px 16px 0 0;">
                            <div style="font-size: 60px; margin-bottom: 20px;">🎉</div>
                            <h1 style="color: #ffffff; font-size: 32px; font-weight: 700; margin: 0;">
                                Referral Success!
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 50px 40px; text-align: center;">
                            <h2 style="color: #1a202c; font-size: 24px; margin-bottom: 20px;">
                                Congratulations, ${safeReferrerName}! 🎊
                            </h2>
                            <p style="color: #4a5568; font-size: 18px; line-height: 1.6; margin-bottom: 30px;">
                                <strong>${safeReferredName}</strong> has successfully joined AdsMoney using your referral code!
                            </p>

                            <div style="background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 12px; padding: 30px; margin: 30px 0;">
                                <div style="font-size: 48px; margin-bottom: 15px;">💰</div>
                                <h3 style="color: #065f46; font-size: 24px; margin-bottom: 10px;">
                                    +${coinsEarned} Coins Earned!
                                </h3>
                                <p style="color: #047857; font-size: 16px; margin: 0;">
                                    Your referral reward has been added to your account
                                </p>
                            </div>

                            <div style="margin: 30px 0;">
                                <a href="${process.env.FRONTEND_URL}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                                    View Your Dashboard
                                </a>
                            </div>

                            <p style="color: #4a5568; font-size: 14px; margin-top: 40px;">
                                Keep sharing your referral code to earn more rewards!
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
};

// Input validation helper
const validateEmailInputs = (templateName, ...inputs) => {
  inputs.forEach((input, index) => {
    if (input === null || input === undefined || input === "") {
      throw new Error(
        `${templateName}: Input parameter ${index + 1} is required`
      );
    }
  });
};

// Export all template functions
module.exports = {
  createVerificationEmailHTML,
  createResendOTPEmailHTML,
  createWelcomeEmailHTML,
  createPasswordResetEmailHTML,
  createReferralSuccessEmailHTML,
  validateEmailInputs,
};
