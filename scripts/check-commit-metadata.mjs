import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const allowedDomain = /^(?:users\.noreply\.github\.com|github\.com|example\.(?:com|org|net|invalid))$/i;
// GitHub's ephemeral PR test merge is not a authored source commit. Exclude its
// metadata only when the checkout and BOTH parents match the trusted event.
export function syntheticPullRequestMerge(eventName, event, head, parents) {
  if (eventName !== 'pull_request' || !/^[a-f0-9]{40}$/.test(head)) return null;
  const pr = event?.pull_request;
  return pr?.merge_commit_sha === head && parents.length === 2 &&
    parents[0] === pr?.base?.sha && parents[1] === pr?.head?.sha ? head : null;
}

/** @param {string} log @param {string | null} excludedCommit */
export function privateCommitMetadata(log, excludedCommit = null) {
  const failures = [];
  for (const line of log.trim().split('\n').filter(Boolean)) {
    const [commit, author, committer] = line.split('\t');
    if (commit === excludedCommit) continue;
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
  let excludedCommit = null;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const [head, ...parents] = execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { encoding: 'utf8' }).trim().split(' ');
    excludedCommit = syntheticPullRequestMerge(process.env.GITHUB_EVENT_NAME, event, head, parents);
  }
  const log = execFileSync('git', ['log', '--all', '--format=%H%x09%ae%x09%ce'], { encoding: 'utf8' });
  const failures = privateCommitMetadata(log, excludedCommit);
  if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
  else console.log(`All source commit identities use approved public email domains.${excludedCommit ? ' Verified ephemeral PR test-merge metadata excluded.' : ''}`);
}
