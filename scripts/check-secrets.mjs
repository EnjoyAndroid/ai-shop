import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const failures = [];
const placeholders = /replace_with|your[-_ ]|example|test[-_ ]|ci-test-only|placeholder|^\s*$|\$\{|process\.env/i;
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/],
  ['Telegram token', /\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
];
for (const file of files) {
  if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size > 2000000) continue;
  if (/^(?:\.env(?:\..*)?)$/.test(file) && !file.endsWith('.example')) { failures.push(`${file}: real environment file must not be tracked`); continue; }
  const data = readFileSync(file); if (data.includes(0)) continue;
  data.toString('utf8').split('\n').forEach((line, index) => {
    for (const [kind, pattern] of patterns) if (pattern.test(line)) failures.push(`${file}:${index + 1}: possible ${kind}`);
    const env = line.match(/^\s*(?:NEXTAUTH_SECRET|ENCRYPTION_KEY|CRON_SECRET|DB_PASSWORD|SMTP_PASS|[A-Z_]+_APPSECRET|[A-Z_]+_API_KEY)\s*=\s*["']?([^"'\r\n]+)["']?\s*$/);
    if (env && !placeholders.test(env[1])) failures.push(`${file}:${index + 1}: non-placeholder secret assignment`);
    // Publishable files should use example addresses or runtime configuration.
    // Report locations only: scanning must not print the personal address itself.
    for (const email of line.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) {
      const domain = email[1].toLowerCase();
      if (!/^example\.(?:com|org|net|invalid)$/.test(domain) && domain !== "users.noreply.github.com" && domain !== "github.com") {
        failures.push(`${file}:${index + 1}: non-example email address; use runtime contact configuration`);
      }
    }
    if (/\bhttps?:\/\/t\.me\/[A-Za-z0-9_]{5,32}/i.test(line) && !/t\.me\/(?:test_[A-Za-z0-9_]*|example[A-Za-z0-9_]*)\b/i.test(line)) {
      failures.push(`${file}:${index + 1}: embedded Telegram contact; use runtime contact configuration`);
    }
    if (/\/(?:Users|home)\/[A-Za-z0-9_.-]+\//.test(line)) failures.push(`${file}:${index + 1}: personal home path`);
  });
}
if (failures.length) { process.stderr.write(failures.join('\n') + '\n'); process.exitCode = 1; }
else process.stdout.write(`Secret checks passed for ${files.length} tracked and publishable files. History is intentionally outside this check.\n`);
