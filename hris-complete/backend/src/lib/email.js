import nodemailer from 'nodemailer';

const truthy = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host) return null;

  const auth = process.env.SMTP_USER || process.env.SMTP_PASS
    ? {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      }
    : undefined;

  return nodemailer.createTransport({
    host,
    port,
    secure: truthy(process.env.SMTP_SECURE) || port === 465,
    ...(auth && { auth }),
  });
}

export function isEmailConfigured() {
  return Boolean(process.env.EMAIL_FROM && process.env.SMTP_HOST);
}

export async function sendEmail({ to, subject, text, html }) {
  if (!to) return { skipped: true, reason: 'missing_recipient' };

  const transport = getTransport();
  if (!process.env.EMAIL_FROM || !transport) {
    return { skipped: true, reason: 'email_not_configured' };
  }

  const fromName = process.env.EMAIL_FROM_NAME || 'Karm ATS';
  const from = `"${fromName}" <${process.env.EMAIL_FROM}>`;

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  return { sent: true };
}
