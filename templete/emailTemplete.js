// Email template functions for your backend

const createVerificationEmailHTML = (name, otp) => {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Verification - AdsMoney</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: -0.5px;">
                                AdsMoney
                            </h1>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="font-size: 24px; font-weight: 600; color: #1F2937; margin-bottom: 20px; text-align: center;">
                                Verify Your Email Address
                            </h2>

                                <p style="font-size: 16px; color: #6B7280; margin-bottom: 30px; text-align: center; line-height: 1.6;">
                                    Hi <b>${name}</b>, thanks for signing up! Please use the verification code below to complete your registration.
                                </p>


                            <!-- OTP Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td align="center">
                                        <div style="background-color: #F9FAFB; border: 2px dashed #D1D5DB; border-radius: 12px; padding: 30px; text-align: center; display: inline-block;">
                                            <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">
                                                Your Verification Code
                                            </p>
                                            <div style="font-size: 36px; font-weight: bold; color: #4F46E5; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                                ${otp}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Warning -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 20px;">
                                        <p style="font-size: 14px; color: #92400E; margin: 0; font-weight: 500;">
                                            ⚠️ This code will expire in 10 minutes. If you didn't request this verification, please ignore this email.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="font-size: 16px; color: #6B7280; text-align: center; margin-bottom: 30px; line-height: 1.6;">
                                Enter this code in the verification form to activate your account.
                            </p>

                            <!-- Help Text -->
                            <p style="font-size: 14px; color: #9CA3AF; text-align: center; margin-bottom: 20px;">
                                Having trouble? Contact our support team at 
                                <a href="mailto:talkproapp@gmail.com" style="color: #4F46E5; text-decoration: none;">talkproapp@gmail.com</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                            <p style="font-size: 12px; color: #9CA3AF; margin: 0 0 10px 0;">
                                © 2025 AdsMoney. All rights reserved.
                            </p>
                            <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
                                This email was sent to verify your account registration.
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

const createResendOTPEmailHTML = (name, otp) => {
  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Verification Code - AdsMoney</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #059669 0%, #10B981 100%); padding: 40px 30px; text-align: center;">
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: -0.5px;">
                                AdsMoney
                            </h1>
                        </td>
                    </tr>

                    <!-- Main Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <h2 style="font-size: 24px; font-weight: 600; color: #1F2937; margin-bottom: 20px; text-align: center;">
                                🔄 New Verification Code
                            </h2>

                            <p style="font-size: 16px; color: #6B7280; margin-bottom: 30px; text-align: center; line-height: 1.6;">
                                Hi <b>${name}</b>, here's your new verification code as requested.
                            </p>

                            <!-- OTP Box -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td align="center">
                                        <div style="background-color: #F0FDF4; border: 2px dashed #10B981; border-radius: 12px; padding: 30px; text-align: center; display: inline-block;">
                                            <p style="font-size: 14px; color: #059669; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500;">
                                                Your New Verification Code
                                            </p>
                                            <div style="font-size: 36px; font-weight: bold; color: #059669; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                                                ${otp}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </table>

                            <!-- Warning -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="background-color: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 20px;">
                                        <p style="font-size: 14px; color: #92400E; margin: 0; font-weight: 500;">
                                            ⚠️ This new code will expire in 10 minutes and replaces your previous code.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <p style="font-size: 16px; color: #6B7280; text-align: center; margin-bottom: 30px; line-height: 1.6;">
                                Enter this code in the verification form to activate your account.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #F9FAFB; padding: 30px; text-align: center; border-top: 1px solid #E5E7EB;">
                            <p style="font-size: 12px; color: #9CA3AF; margin: 0 0 10px 0;">
                                © 2025 AdsMoney. All rights reserved.
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

module.exports = {
  createVerificationEmailHTML,
  createResendOTPEmailHTML
};