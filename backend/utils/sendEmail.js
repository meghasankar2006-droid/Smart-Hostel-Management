const nodemailer = require('nodemailer');

/**
 * Sends an email using SMTP configuration from environment variables.
 * @param {Object} options - { to, subject, text, html }
 */
const sendEmail = async (options) => {
  try {
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
      console.warn('⚠️ SMTP credentials missing in .env. Email not sent to:', options.to);
      return false; // Fail gracefully without throwing
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const message = {
      from: `${process.env.EMAIL_FROM_NAME || 'Smart Hostel'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await transporter.sendMail(message);
    console.log('Message sent: %s', info.messageId);
    return true;
  } catch (err) {
    console.error('Email sending failed:', err.message);
    return false; // Fail gracefully
  }
};

module.exports = sendEmail;
