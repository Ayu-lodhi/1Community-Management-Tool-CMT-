const nodemailer = require('nodemailer');

// Encode profile text where it enters HTML, preserving stored and plain-text names.
const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// ====================================================================
// Email Service — Nodemailer with two modes:
//   1. TEST: Uses Ethereal (fake SMTP that captures emails)
//   2. PROD: Uses real SMTP (Gmail/SendGrid)
// ====================================================================

let transporter = null;
let testAccount = null;

// Initialize transporter
const initTransporter = async () => {
  if (transporter) return transporter;

  // Check if real SMTP credentials are provided
  const hasRealCreds = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;

  if (hasRealCreds) {
    console.log('EMAIL_INIT :: Using real SMTP:', process.env.EMAIL_HOST);
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Use Ethereal for testing
    console.log('EMAIL_INIT :: No SMTP creds - using Ethereal test account');
    testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('EMAIL_INIT :: Ethereal user:', testAccount.user);
  }

  return transporter;
};

// Send email
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const t = await initTransporter();
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || '"TBI Platform" <noreply@tbi.org>',
      to,
      subject,
      html: html || text,
      text: text || '',
    });

    const redactEmail = (addr) => { const [u, d] = (addr || '').split('@'); return `${u.slice(0, 2)}***@${d || '?'}`; };
    console.log(`EMAIL_SENT :: to=${redactEmail(to)} :: subject="[redacted]" :: id=${info.messageId}`);

    // If using Ethereal, print preview URL
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`EMAIL_PREVIEW :: ${previewUrl}`);
    }

    return { success: true, messageId: info.messageId, previewUrl };
  } catch (err) {
    console.error('EMAIL_FAILED ::', err.message);
    return { success: false, error: err.message };
  }
};

// ====================================================================
// WELCOME EMAIL TEMPLATE — Sent when Admin creates a user
// ====================================================================
const sendWelcomeEmail = async ({ to, name, role, tempPassword, loginUrl }) => {
  const tierLabel = {
    T1_VOLUNTEER: 'T1 Volunteer',
    T2_ASSOCIATE: 'T2 Associate',
    T3_EXECUTIVE: 'T3 Executive',
    ADMIN: 'Administrator',
    SUPER_ADMIN: 'Super Administrator',
  }[role] || role;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
              
              <!-- Header -->
              <tr>
                <td style="background:linear-gradient(135deg,#0EA5E9,#6366F1);padding:40px 40px 32px;text-align:center;">
                  <h1 style="margin:0 0 8px;color:#ffffff;font-size:28px;font-weight:700;">Welcome to TBI</h1>
                  <p style="margin:0;color:rgba(255,255,255,0.9);font-size:15px;">Your account has been created</p>
                </td>
              </tr>
              
              <!-- Body -->
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 20px;font-size:16px;color:#111827;line-height:1.6;">
                    Hi <strong>${escapeHtml(name)}</strong>,
                  </p>
                  <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                    An administrator has created an account for you on the TBI Workforce Platform. 
                    Your role is: <strong style="color:#0EA5E9;">${tierLabel}</strong>
                  </p>
                  
                  <!-- Credentials Box -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:24px;">
                        <p style="margin:0 0 16px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
                          Your Login Credentials
                        </p>
                        
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding:8px 0;font-size:14px;color:#6b7280;width:120px;">Email</td>
                            <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:600;">${to}</td>
                          </tr>
                          <tr>
                            <td style="padding:8px 0;font-size:14px;color:#6b7280;">Temp Password</td>
                            <td style="padding:8px 0;font-size:16px;color:#111827;font-weight:700;font-family:'Courier New',monospace;letter-spacing:1px;">
                              ${tempPassword}
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- Warning -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px;">
                        <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#92400e;">
                          Important — One-Time Use
                        </p>
                        <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
                          This password can only be used <strong>once</strong>. You will be required to 
                          set a new password immediately after your first login. Do not share these credentials with anyone.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <!-- CTA -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding:8px 0 32px;">
                        <a href="${loginUrl}" style="display:inline-block;background:#0EA5E9;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
                          Sign In to Platform
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                    If you did not expect this email or believe it was sent in error, please contact 
                    your TBI administrator immediately.
                  </p>
                </td>
              </tr>
              
              <!-- Footer -->
              <tr>
                <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    TBI Workforce Platform — Automated notification. Do not reply.
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

  const text = `
Welcome to TBI, ${name}!

Your account has been created on the TBI Workforce Platform.
Role: ${tierLabel}

Login Credentials:
  Email: ${to}
  Temp Password: ${tempPassword}

IMPORTANT: This password is one-time use only. You will be required to set a new password on first login.

Sign in here: ${loginUrl}

If you did not expect this email, contact your TBI administrator.
  `;

  return await sendEmail({
    to,
    subject: 'Your TBI Account Credentials',
    html,
    text,
  });
};

// ====================================================================
// PASSWORD RESET LINK EMAIL — one-time reset link sent by admin action
// ====================================================================
const sendPasswordResetLinkEmail = async ({ to, name, resetUrl }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
              <tr>
                <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:40px 40px 32px;text-align:center;">
                  <h1 style="margin:0 0 8px;color:#ffffff;font-size:26px;font-weight:700;">Password Reset Request</h1>
                  <p style="margin:0;color:rgba(255,255,255,0.9);font-size:15px;">An administrator has initiated a password reset for your account</p>
                </td>
              </tr>
              <tr>
                <td style="padding:40px;">
                  <p style="margin:0 0 20px;font-size:16px;color:#111827;line-height:1.6;">
                    Hi <strong>${escapeHtml(name)}</strong>,
                  </p>
                  <p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">
                    An administrator has sent you a secure link to reset your password. Click the button below to set a new password for your TBI account.
                  </p>

                  <!-- CTA Button -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                    <tr>
                      <td align="center" style="padding:8px 0;">
                        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#ef4444);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;letter-spacing:0.3px;">
                          &#128274;&nbsp; Reset My Password
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Warning -->
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px;">
                        <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#92400e;">
                          &#9888; One-Time Use &amp; Expires in 1 Hour
                        </p>
                        <p style="margin:0;font-size:13px;color:#78350f;line-height:1.5;">
                          This link can only be used <strong>once</strong> and will expire <strong>1 hour</strong> after it was sent. Do not share this link with anyone.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Fallback URL -->
                  <p style="margin:0 0 16px;font-size:12px;color:#9ca3af;line-height:1.6;">
                    If the button doesn't work, copy and paste this link into your browser:<br>
                    <span style="color:#0EA5E9;word-break:break-all;">${resetUrl}</span>
                  </p>

                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                    If you did not expect this email, you can safely ignore it. Your password will not change until you use this link.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    TBI Workforce Platform — Automated notification. Do not reply.
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

  const text = `
Password Reset - TBI Platform

Hi ${name},

An administrator has sent you a secure one-time link to reset your password.

Click the link below to set a new password:
${resetUrl}

IMPORTANT: This link can only be used ONCE and expires in 1 hour. Do not share it.

If you did not expect this email, you can safely ignore it.
  `;

  return await sendEmail({
    to,
    subject: 'Password Reset Link — TBI Platform',
    html,
    text,
  });
};

const sendProfileUpdatedEmail = async ({ to, name, updatedFields = [], byAdmin = false }) => {
  const fieldsFormatted = updatedFields
    .map((f) => f.charAt(0).toUpperCase() + f.slice(1))
    .join(', ') || 'Account details';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
              <tr>
                <td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:36px 40px 28px;text-align:center;">
                  <h1 style="margin:0 0 8px;color:#ffffff;font-size:24px;font-weight:700;">Account Details Updated</h1>
                  <p style="margin:0;color:rgba(255,255,255,0.9);font-size:14px;">Your profile changes have been saved</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#111827;line-height:1.6;">
                    Hi <strong>${escapeHtml(name)}</strong>,
                  </p>
                  <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
                    ${byAdmin ? 'An administrator has updated' : 'You have recently updated'} your profile details on the TBI Platform.
                  </p>
                  
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:20px;">
                        <p style="margin:0 0 8px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">
                          Modified Fields
                        </p>
                        <p style="margin:0;font-size:15px;color:#0f172a;font-weight:600;">
                          ${escapeHtml(fieldsFormatted)}
                        </p>
                        <p style="margin:12px 0 0;font-size:13px;color:#64748b;">
                          Date & Time: ${new Date().toUTCString()}
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                    If you did not make or authorize this change, please contact your TBI administrator immediately.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    TBI Workforce Platform — Automated notification. Do not reply.
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

  const text = `
Account Details Updated - TBI Platform

Hi ${name},

${byAdmin ? 'An administrator has updated' : 'You have recently updated'} your profile details.
Updated fields: ${fieldsFormatted}
Timestamp: ${new Date().toUTCString()}

If you did not authorize this change, please contact your administrator.
  `;

  return await sendEmail({
    to,
    subject: 'Your TBI Account Details Have Been Updated',
    html,
    text,
  });
};

const sendPasswordChangedEmail = async ({ to, name, byAdmin = false }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
              <tr>
                <td style="background:linear-gradient(135deg,#10b981,#059669);padding:36px 40px 28px;text-align:center;">
                  <h1 style="margin:0 0 8px;color:#ffffff;font-size:24px;font-weight:700;">Password Changed Successfully</h1>
                  <p style="margin:0;color:rgba(255,255,255,0.9);font-size:14px;">Security notification for your TBI account</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#111827;line-height:1.6;">
                    Hi <strong>${escapeHtml(name)}</strong>,
                  </p>
                  <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
                    The password for your TBI account (<strong>${escapeHtml(to)}</strong>) was ${byAdmin ? 'changed by an administrator' : 'successfully updated'}.
                  </p>
                  
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border-left:4px solid #10b981;border-radius:6px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px;">
                        <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#065f46;">
                          Security Confirmation
                        </p>
                        <p style="margin:0;font-size:13px;color:#047857;line-height:1.5;">
                          Your previous password is no longer valid. You can now use your new password to sign in.
                        </p>
                      </td>
                    </tr>
                  </table>
                  
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                    <strong>Notice:</strong> If you did not make this change, your account may be compromised. Please notify your TBI administrator immediately.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    TBI Workforce Platform — Automated security notification. Do not reply.
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

  const text = `
Password Changed - TBI Platform

Hi ${name},

The password for your account (${to}) was successfully updated.
Your previous password is no longer valid.

If you did not perform or authorize this action, please alert your administrator immediately.
  `;

  return await sendEmail({
    to,
    subject: 'Security Alert: Your TBI Password Has Been Changed',
    html,
    text,
  });
};

// ====================================================================
// EMAIL ADDRESS CHANGED NOTIFICATION
// ====================================================================
const sendEmailChangedEmail = async ({ oldEmail, newEmail, name, byAdmin = false }) => {
  // 1. Alert to OLD email address
  const oldHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
              <tr>
                <td style="background:linear-gradient(135deg,#f59e0b,#ef4444);padding:36px 40px;text-align:center;">
                  <h1 style="margin:0 0 8px;color:#ffffff;font-size:24px;font-weight:700;">Account Email Changed</h1>
                  <p style="margin:0;color:rgba(255,255,255,0.95);font-size:14px;">Important security notification for your TBI account</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#111827;line-height:1.6;">
                    Hi <strong>${escapeHtml(name)}</strong>,
                  </p>
                  <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
                    The email address associated with your TBI Workforce account was ${byAdmin ? 'changed by an administrator' : 'recently updated'}.
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px;">
                        <p style="margin:0 0 6px;font-size:14px;color:#991b1b;">
                          <strong>Previous Email:</strong> ${escapeHtml(oldEmail)}
                        </p>
                        <p style="margin:0;font-size:14px;color:#991b1b;">
                          <strong>New Email:</strong> ${escapeHtml(newEmail)}
                        </p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                    <strong>Notice:</strong> This email address (${escapeHtml(oldEmail)}) will no longer be able to log in to this account. If you did not make or authorize this change, please contact your administrator immediately.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    TBI Workforce Platform — Automated security notification. Do not reply.
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

  const oldText = `
Account Email Changed - TBI Platform

Hi ${name},

The email address for your TBI account was changed from ${oldEmail} to ${newEmail}${byAdmin ? ' by an administrator' : ''}.
This email (${oldEmail}) will no longer be able to log in.

If you did not authorize this change, please contact your administrator immediately.
  `;

  // 2. Notification to NEW email address
  const newHtml = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
              <tr>
                <td style="background:linear-gradient(135deg,#0EA5E9,#6366F1);padding:36px 40px;text-align:center;">
                  <h1 style="margin:0 0 8px;color:#ffffff;font-size:24px;font-weight:700;">Email Address Confirmed</h1>
                  <p style="margin:0;color:rgba(255,255,255,0.9);font-size:14px;">Your TBI account email has been updated</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  <p style="margin:0 0 16px;font-size:16px;color:#111827;line-height:1.6;">
                    Hi <strong>${escapeHtml(name)}</strong>,
                  </p>
                  <p style="margin:0 0 20px;font-size:15px;color:#4b5563;line-height:1.6;">
                    Your TBI Workforce account email address has been successfully set to <strong>${escapeHtml(newEmail)}</strong>${byAdmin ? ' by an administrator' : ''}.
                  </p>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px;margin-bottom:24px;">
                    <tr>
                      <td style="padding:16px;">
                        <p style="margin:0;font-size:14px;color:#1e40af;line-height:1.5;">
                          You can now use <strong>${escapeHtml(newEmail)}</strong> with your existing password to log in.
                        </p>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                    If you did not authorize this change, please inform your administrator immediately.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    TBI Workforce Platform — Automated security notification. Do not reply.
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

  const newText = `
Email Address Confirmed - TBI Platform

Hi ${name},

Your TBI account email address has been successfully updated to: ${newEmail}.
You can now use this email to log in to the portal.
  `;

  // Send to both old and new email addresses
  const promises = [];
  if (oldEmail) {
    promises.push(sendEmail({
      to: oldEmail,
      subject: 'Security Alert: Your TBI Account Email Was Changed',
      html: oldHtml,
      text: oldText,
    }));
  }
  if (newEmail) {
    promises.push(sendEmail({
      to: newEmail,
      subject: 'TBI Platform: Your Account Email Has Been Set',
      html: newHtml,
      text: newText,
    }));
  }

  const results = await Promise.allSettled(promises);
  return { success: results.some((r) => r.status === 'fulfilled' && r.value?.success) };
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetLinkEmail,
  sendProfileUpdatedEmail,
  sendPasswordChangedEmail,
  sendEmailChangedEmail,
};
