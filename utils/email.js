// utils/email.js
const sgMail = require('@sendgrid/mail');

if (!process.env.SMTP_PASS || !process.env.EMAIL_FROM) {
  console.warn('Missing SendGrid API key or EMAIL_FROM in env');
}

sgMail.setApiKey(process.env.SMTP_PASS);

async function sendAlertEmail({ to, subject, text, html }) {
  const msg = {
    to,
    from: process.env.EMAIL_FROM,
    subject,
    text,
    html,
  };
  return sgMail.send(msg);
}

module.exports = { sendAlertEmail };
