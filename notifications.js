'use strict';
const nodemailer = require('nodemailer');

/**
 * Send an email notification.
 * Falls back to console.log if SMTP env vars are not configured.
 */
async function sendEmail({ to, subject, html }) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        const errMsg = "SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS) are not configured. Cannot send real email.";
        console.error(`📧 [Email Error] ${errMsg}`);
        throw new Error(errMsg);
    }
    try {
        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: parseInt(SMTP_PORT || '587', 10),
            secure: parseInt(SMTP_PORT || '587', 10) === 465,
            auth: { user: SMTP_USER, pass: SMTP_PASS }
        });
        const info = await transporter.sendMail({ from: SMTP_USER, to, subject, html });
        console.log(`📧 [Email] Sent to ${to}: ${info.messageId}`);
        return { messageId: info.messageId };
    } catch (err) {
        console.error(`📧 [Email Error] ${err.message}`);
        throw err;
    }
}

/**
 * Send an SMS notification via Twilio.
 * Throws an error if Twilio env vars are not configured.
 */
async function sendSMS({ to, body }) {
    const { TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM } = process.env;
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
        const errMsg = "Twilio credentials (TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM) are not configured. Cannot send real SMS.";
        console.error(`📱 [SMS Error] ${errMsg}`);
        throw new Error(errMsg);
    }
    try {
        const twilio = require('twilio')(TWILIO_SID, TWILIO_TOKEN);
        const msg = await twilio.messages.create({ body, from: TWILIO_FROM, to });
        console.log(`📱 [SMS] Sent to ${to}: SID ${msg.sid}`);
        return { sid: msg.sid };
    } catch (err) {
        console.error(`📱 [SMS Error] ${err.message}`);
        throw err;
    }
}

module.exports = { sendEmail, sendSMS };
