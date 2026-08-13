import nodemailer from 'nodemailer';
import { getEmailConfig } from '../config/env.js';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function createEmailService(overrides = {}) {
  const config = getEmailConfig(overrides);
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: config.connectionTimeoutMs,
    greetingTimeout: config.connectionTimeoutMs,
    socketTimeout: config.connectionTimeoutMs,
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  return {
    async sendExpiryReminder({ to, userName, documentLabel, expiryDate, daysBefore }) {
      const subject = `${documentLabel}: ${daysBefore}-day expiry reminder`;
      const text = [
        `Hello ${userName},`,
        '',
        `${documentLabel} expires on ${expiryDate}.`,
        `This is your ${daysBefore}-day reminder from Smart Visa Tracker.`,
        '',
        'Review your document and confirm any requirements with the relevant official authorities.',
      ].join('\n');
      const html = `<p>Hello ${escapeHtml(userName)},</p>
        <p><strong>${escapeHtml(documentLabel)}</strong> expires on <strong>${escapeHtml(expiryDate)}</strong>.</p>
        <p>This is your ${daysBefore}-day reminder from Smart Visa Tracker.</p>
        <p>Review your document and confirm any requirements with the relevant official authorities.</p>`;

      const result = await transporter.sendMail({
        from: config.from,
        to,
        subject,
        text,
        html,
      });
      return { messageId: result.messageId ?? null, subject };
    },
  };
}
