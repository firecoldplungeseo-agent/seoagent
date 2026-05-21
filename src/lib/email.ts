import nodemailer from 'nodemailer';

export interface SendDigestOptions {
  subject: string;
  body: string;
  recipients: string[];
}

export async function sendDigestEmail(opts: SendDigestOptions): Promise<void> {
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;

  if (!user || !password) {
    throw new Error(
      'GMAIL_USER and GMAIL_APP_PASSWORD must be set to send email. ' +
        'Generate an App Password at https://myaccount.google.com/apppasswords ' +
        '(requires 2FA enabled on the account).',
    );
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass: password },
  });

  await transporter.sendMail({
    from: `"Plunge Zero SEO" <${user}>`,
    to: opts.recipients.join(', '),
    subject: opts.subject,
    text: opts.body,
  });
}

export function parseRecipients(): string[] {
  const raw = process.env.DIGEST_RECIPIENTS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
