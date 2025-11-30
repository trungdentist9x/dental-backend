// utils/mailer.js
const nodemailer = require('nodemailer');

let transporter;
function initMailer(cfg){
  transporter = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: parseInt(cfg.SMTP_PORT || '587'),
    secure: false,
    auth: { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS }
  });
}
async function sendEmail(to, subject, html){
  if (!transporter) throw new Error('Mailer not initialized');
  return transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, html });
}
module.exports = { initMailer, sendEmail };
