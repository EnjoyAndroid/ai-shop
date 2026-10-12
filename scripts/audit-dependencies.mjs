import { spawnSync } from 'node:child_process';
import { checkBracesPatch } from './patch-braces.mjs';

// npm audit still reports the original version. Only this locally patched
// advisory is accepted; network failures and all other advisories fail closed.
checkBracesPatch();
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (result.error) throw result.error;
const report = JSON.parse(result.stdout || '{}');
if (report.error || !report.metadata || !report.vulnerabilities || ![0, 1].includes(result.status)) throw new Error('npm audit failed; dependency security could not be verified');
const accepted = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const vulnerabilities = report.vulnerabilities;
function onlyMitigated(name, seen = new Set()) {
  if (seen.has(name) || !vulnerabilities[name]?.via?.length) return false;
  const next = new Set(seen).add(name);
  return vulnerabilities[name].via.every(via => typeof via === 'string'
    ? onlyMitigated(via, next)
    : via.name === 'braces' && via.url === accepted);
}
const unresolved = Object.keys(vulnerabilities).filter(name => !onlyMitigated(name));
console.log(`npm audit: ${report.metadata.vulnerabilities.total} affected packages; ${Object.keys(vulnerabilities).length - unresolved.length} covered by the verified braces patch; ${unresolved.length} unresolved.`);
if (unresolved.length) {
  console.error(`Unresolved dependency advisories: ${unresolved.join(', ')}`);
  process.exitCode = 1;
}
