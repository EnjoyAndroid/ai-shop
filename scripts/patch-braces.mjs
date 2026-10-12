import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// GHSA-vfj7-8cjw-p6xm has no upstream release as of 2026-10-13.
// Bound the parser's explicit stack before downstream recursive AST walkers.
// Keep the published version/lock integrity intact and verify exact source bytes.
const originalHash = 'e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310';
const needle = '  while (index < length) {\n';
const replacement = needle + "    if (stack.length > 64) throw new SyntaxError('Brace pattern nesting exceeds 64 levels');\n";
const hash = value => createHash('sha256').update(value).digest('hex');

export function checkBracesPatch({ apply = false } = {}) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const paths = Object.keys(lock.packages).filter(path => path.endsWith('node_modules/braces'));
  let checked = 0;
  for (const path of paths) {
    if (!existsSync(`${path}/package.json`)) throw new Error(`Missing dependency: ${path}; run npm ci`);
    const manifest = JSON.parse(readFileSync(`${path}/package.json`, 'utf8'));
    if (manifest.version !== '3.0.3' || lock.packages[path].version !== '3.0.3') throw new Error('braces changed; review and retire/update the security patch');
    const file = `${path}/lib/parse.js`;
    const source = readFileSync(file, 'utf8');
    const original = source.includes(replacement) ? source.replace(replacement, needle) : source;
    if (hash(original) !== originalHash) throw new Error(`Unexpected braces source: ${file}`);
    const patched = original.replace(needle, replacement);
    if (apply && source === original) writeFileSync(file, patched);
    else if (source !== patched) throw new Error(`Missing braces security patch: ${file}`);
    checked++;
  }
  if (checked === 0) throw new Error('No braces dependency found; review and remove the temporary mitigation');
  return checked;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = checkBracesPatch({ apply: !process.argv.includes('--check') });
  console.log(`Verified braces nesting mitigation in ${count} installed package(s).`);
}
