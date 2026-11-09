import nodemailer, { type Transporter } from "nodemailer";
import { DomainError } from "@/server/errors";
import { logger } from "@/server/logger";

export type Mail = { to: string; subject: string; text: string; html: string };

export const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

let transport: Transporter | undefined;
function getTransport(): Transporter {
  const port = Number(process.env.SMTP_PORT ?? 465);
  return (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  }));
}

/**
 * Sends an email through SMTP (Gmail with an App Password, or any provider).
 * Production without SMTP settings FAILS (login codes must never silently go nowhere).
 * Development without SMTP prints the email, including the code, to the server console.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === "production")
      throw new DomainError("MAIL_NOT_CONFIGURED", "The login code could not be emailed because email is not set up on the server. See docs/05-two-factor-and-cloudflare.md.");
    logger.warn("DEV MODE: SMTP not configured, email printed instead of sent", { to: mail.to, subject: mail.subject, body: mail.text });
    return;
  }
  try {
    await getTransport().sendMail({
      from: process.env.MAIL_FROM || `FBM Labor <${process.env.SMTP_USER}>`,
      to: mail.to, subject: mail.subject, text: mail.text, html: mail.html,
    });
  } catch (e) {
    logger.error("Email sending failed", e, { to: mail.to });
    throw new DomainError("MAIL_FAILED", "The login code could not be emailed. Check the email settings and try again.");
  }
}
