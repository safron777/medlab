'use strict';
/**
 * Mailer — wraps nodemailer.
 * If SMTP_HOST is not set, falls back to dev mode (no email sent).
 */
const nodemailer = require('nodemailer');

const devMode = !process.env.SMTP_HOST;

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true → 465, false → STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transporter;
}

/**
 * Send a password-reset email.
 * @param {string} to       Recipient email
 * @param {string} token    Reset token
 * @param {string} baseUrl  App base URL (e.g. https://myapp.com)
 * @returns {Promise<{sent: boolean, devToken?: string}>}
 */
async function sendPasswordReset(to, token, baseUrl) {
  if (devMode) {
    // Dev mode: caller includes token in API response
    return { sent: false, devToken: token };
  }

  const from    = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = 'MedLab — сброс пароля';
  const resetUrl = `${baseUrl}?resetToken=${token}`;

  const html = `
<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:480px;margin:32px auto;color:#1a1a2e">
  <div style="border-bottom:2px solid #00836e;padding-bottom:12px;margin-bottom:24px">
    <span style="font-size:22px;font-weight:700;color:#00836e">Med</span><span style="font-size:22px;font-weight:700;color:#3B82F6">Lab</span>
  </div>
  <p>Вы запросили сброс пароля. Нажмите кнопку ниже, чтобы задать новый пароль.</p>
  <p>Ссылка действительна <strong>1 час</strong>.</p>
  <div style="text-align:center;margin:28px 0">
    <a href="${resetUrl}"
       style="background:#00836e;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:600">
      Сбросить пароль
    </a>
  </div>
  <p style="font-size:12px;color:#6b7280">
    Если кнопка не работает, скопируйте ссылку в браузер:<br>
    <a href="${resetUrl}" style="color:#00836e">${resetUrl}</a>
  </p>
  <p style="font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:24px">
    Если вы не запрашивали сброс пароля — проигнорируйте это письмо.
  </p>
</body>
</html>`;

  const text = `MedLab — сброс пароля\n\nСсылка для сброса (действует 1 час):\n${resetUrl}\n\nЕсли вы не запрашивали сброс — проигнорируйте это письмо.`;

  await getTransporter().sendMail({ from, to, subject, html, text });
  return { sent: true };
}

module.exports = { sendPasswordReset, devMode };
