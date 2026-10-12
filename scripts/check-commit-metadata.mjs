import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const allowedDomain = /^(?:users\.noreply\.github\.com|github\.com|example\.(?:com|org|net|invalid))$/i;
export function privateCommitMetadata(log) {
  const failures = [];
  for (const line of log.trim().split('\n').filter(Boolean)) {
    const [commit, author, committer] = line.split('\t');
    for (const [field, email] of [['author', author], ['committer', committer]]) {
      if (!email || !allowedDomain.test(email.slice(email.lastIndexOf('@') + 1))) {
        // Addresses are never copied into diagnostics or CI logs.
        failures.push(`${commit}: ${field} email is not an approved public identity`);
      }
    }
  }
  return failures;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true') throw new Error('History check requires a full checkout (fetch-depth: 0)');
  const log = execFileSync('git', ['log', '--all', '--format=%h%x09%ae%x09%ce'], { encoding: 'utf8' });
  const failures = privateCommitMetadata(log);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log('All reachable commit identities use approved public email domains.');
}
