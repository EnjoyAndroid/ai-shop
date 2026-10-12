// Verify SMTP connectivity and authentication without sending a message.
import { lookup } from "node:dns/promises";
import nodemailer from "nodemailer";
import { getSmtpOptions, logMailFailure } from "../src/lib/smtp";

async function main() {
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
  try {
    const options = getSmtpOptions();
    const addresses = await lookup(options.host, { all: true });
    console.log(JSON.stringify({
      host: options.host, port: options.port, encrypted: options.secure ? "TLS" : "STARTTLS",
      senderMatchesLogin: process.env.MAIL_FROM?.trim() === options.auth.user,
      proxyVirtualAddress: addresses.some(({ address }) => /^198\.(18|19)\./.test(address)),
    }));
    transport = nodemailer.createTransport(options);
    await transport.verify();
    console.log("SMTP connection and authentication verified; no email was sent.");
  } catch (error) {
    logMailFailure("SMTP verification", error);
    console.log("SMTP verification failed. CONN indicates network/TLS trouble; EAUTH indicates rejected credentials.");
    process.exitCode = 1;
  } finally { transport?.close(); }
}

void main();
