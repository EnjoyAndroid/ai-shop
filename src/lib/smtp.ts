import nodemailer from "nodemailer";
import { logWarn } from "./logger";

export class MailConfigurationError extends Error {
  constructor() { super("邮件服务配置不完整"); }
}

export function getSmtpOptions() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const sender = process.env.MAIL_FROM?.trim();
  const port = Number(process.env.SMTP_PORT || 465);
  if (!host || !user || !pass || !sender || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new MailConfigurationError();
  }
  return {
    host, port, secure: port === 465,
    // Keep credentials encrypted on STARTTLS ports as well.
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };
}

export async function sendMail(message: { to: string; subject: string; html: string }) {
  const options = getSmtpOptions();
  const transporter = nodemailer.createTransport(options);
  try {
    await transporter.sendMail({ ...message, from: { name: "AI Shop", address: process.env.MAIL_FROM!.trim() } });
  } finally { transporter.close(); }
}

// Do not log provider responses: they can contain addresses, credentials or links.
export function logMailFailure(context: string, error: unknown) {
  if (error instanceof MailConfigurationError) {
    logWarn(context, "mail_error=CONFIGURATION");
    return;
  }
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const allowedCodes = ["ESOCKET", "ECONNECTION", "ETIMEDOUT", "EAUTH", "EENVELOPE", "EMESSAGE", "EDNS", "ECONNRESET", "ECONNREFUSED"];
  const allowedCommands = ["CONN", "EHLO", "HELO", "STARTTLS", "AUTH PLAIN", "AUTH LOGIN", "AUTH XOAUTH2", "MAIL FROM", "RCPT TO", "DATA"];
  const code = typeof value.code === "string" && allowedCodes.includes(value.code) ? value.code : "UNKNOWN";
  const command = typeof value.command === "string" && allowedCommands.includes(value.command) ? value.command : "UNKNOWN";
  const responseCode = typeof value.responseCode === "number" && Number.isInteger(value.responseCode) && value.responseCode >= 100 && value.responseCode <= 599 ? value.responseCode : "NONE";
  logWarn(context, `mail_error=${code} command=${command} response_code=${responseCode}`);
}
