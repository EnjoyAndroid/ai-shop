import test from "node:test";
import assert from "node:assert/strict";
import { getSmtpOptions, logMailFailure, MailConfigurationError } from "../src/lib/smtp";

function withConfiguration(run: () => void) {
  const names = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_USER: "sender@example.com", SMTP_PASS: "test-only-mail-secret", MAIL_FROM: "sender@example.com" });
  try { run(); } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
}

test("SMTP uses encryption and bounded timeouts; incomplete configuration does not connect to localhost", () => withConfiguration(() => {
  const implicitTls = getSmtpOptions();
  assert.equal(implicitTls.secure, true);
  assert(implicitTls.connectionTimeout <= 15000 && implicitTls.socketTimeout <= 30000);
  process.env.SMTP_PORT = "587";
  const startTls = getSmtpOptions();
  assert.equal(startTls.secure, false);
  assert.equal(startTls.requireTLS, true);
  for (const port of ["bad", "0", "65536", "465.5"]) {
    process.env.SMTP_PORT = port;
    assert.throws(getSmtpOptions, MailConfigurationError);
  }
  process.env.SMTP_PORT = "465";
  process.env.SMTP_HOST = "";
  assert.throws(getSmtpOptions, MailConfigurationError);
}));

test("mail diagnostics retain useful status codes without provider content or addresses", context => {
  const lines: string[] = [];
  context.mock.method(console, "warn", (...args: unknown[]) => lines.push(args.join(" ")));
  logMailFailure("Mail", { code: "EAUTH", command: "AUTH PLAIN", responseCode: 535, response: "private@example.com private-password private-token", message: "private@example.com" });
  assert(lines[0].includes("EAUTH") && lines[0].includes("535"));
  logMailFailure("Mail", { code: "private@example.com", command: "private-token", responseCode: "private-password" });
  assert(lines.every(line => !line.includes("private")));
});
