import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { generateEnvironment, writeEnv } from '../scripts/lib/environments.mjs';
const moduleUrl = pathToFileURL(resolve('scripts/lib/environments.mjs')).href;
function run(cwd: string, expression = 'initializeEnvironments()') {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import {initializeEnvironments,configurationSummary} from ${JSON.stringify(moduleUrl)}; ${expression};`], { cwd, encoding: 'utf8' });
}

test('configuration consolidation preserves existing credentials and archives identical aliases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shop-env-'));
  try {
    mkdirSync(join(dir, '.deploy'));
    const dev = generateEnvironment('development'), acceptance = generateEnvironment('test');
    writeEnv(join(dir, '.env'), dev); writeEnv(join(dir, '.env.development.local'), dev);
    symlinkSync('.env', join(dir, '.env.local')); writeEnv(join(dir, '.env.test.local'), acceptance);
    const production = 'SUPPORT_LLM_API_KEY="test-only-private-value"\n';
    writeFileSync(join(dir, '.deploy/production.env'), production);
    assert.equal(run(dir).status, 0);
    assert.deepEqual(readFileSync(join(dir, '.env')), readFileSync(join(dir, '.deploy/archive/environment-files', readdirSync(join(dir, '.deploy/archive/environment-files')).find(n => n.startsWith('env.development.local-'))!)));
    assert.equal(readFileSync(join(dir, '.deploy/production.env'), 'utf8'), production);
    assert(!existsSync(join(dir, '.env.local'))); assert(!existsSync(join(dir, '.env.development.local'))); assert(!existsSync(join(dir, '.env.test.local')));
    const testConfig = readFileSync(join(dir, '.deploy/test.env'));
    assert.equal(run(dir).status, 0); assert.deepEqual(readFileSync(join(dir, '.deploy/test.env')), testConfig);
    const status = run(dir, 'console.log(JSON.stringify(configurationSummary()))');
    assert.equal(status.status, 0); assert(!status.stdout.includes('test-only-private-value')); assert(!status.stdout.includes(dev.DEV_DB_PASSWORD));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('different overrides fail before changes and production-looking default is rejected', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shop-env-conflict-'));
  try {
    const dev = generateEnvironment('development');
    writeEnv(join(dir, '.env'), dev);
    writeEnv(join(dir, '.env.local'), { ...dev, NEXT_PUBLIC_SITE_NAME: 'conflicting store' });
    const before = readFileSync(join(dir, '.env'));
    assert.notEqual(run(dir).status, 0); assert.deepEqual(readFileSync(join(dir, '.env')), before);
    assert(!existsSync(join(dir, '.deploy/test.env')));
    rmSync(join(dir, '.env.local'));
    writeEnv(join(dir, '.env'), { ...dev, DATABASE_URL: 'postgresql://aishop:test-only@localhost:55439/ai_shop' });
    assert.notEqual(run(dir).status, 0); assert(!existsSync(join(dir, '.deploy/test.env')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fresh initialization creates one local config and one private automated-test config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shop-env-new-'));
  try {
    assert.equal(run(dir).status, 0);
    assert.deepEqual(readdirSync(dir).sort(), ['.deploy', '.env']);
    assert(existsSync(join(dir, '.deploy/test.env')));
    assert(!existsSync(join(dir, '.deploy/production.env')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
