import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { generateEnvironment, writeEnv } from '../scripts/lib/environments.mjs';
const moduleUrl = pathToFileURL(resolve('scripts/lib/local-runtime.mjs')).href;

function execute(cwd: string, expression: string) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import {acquireLocalLease, localRuntimeEnvironment, localHostRuntimeEnvironment, activateLocalPreview} from ${JSON.stringify(moduleUrl)}; ${expression}`], { cwd, encoding: 'utf8' });
}

test('local development and manual preview share one configuration and canonical origin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shop-local-mode-'));
  try {
    writeEnv(join(dir, '.env'), { ...generateEnvironment('development'), SUPPORT_LLM_API_KEY: 'test-only-development-key', SUPPORT_LLM_BASE_URL: 'https://model.example.invalid/v1' });
    const result = execute(dir, `const env=localRuntimeEnvironment(); assert.equal(env.NEXTAUTH_URL,'http://127.0.0.1:3013'); assert.equal(new URL(env.DATABASE_URL).pathname,'/ai_shop_dev'); assert.equal(env.SUPPORT_LLM_API_KEY,'test-only-development-key'); assert.equal(env.SUPPORT_LLM_BASE_URL,'https://model.example.invalid/v1');`);
    assert.equal(result.status, 0, result.stderr);
    const local = readFileSync('docker-compose.yml', 'utf8');
    assert(local.includes('SUPPORT_LLM_API_KEY: ${SUPPORT_LLM_API_KEY:-}')); assert(local.includes('ai_shop_dev')); assert(local.includes('redis://redis:6379/0')); assert(local.includes('127.0.0.1:3013:3000'));
    const machine = readFileSync('docker-compose.test.yml', 'utf8');
    assert(machine.includes("SUPPORT_LLM_API_KEY: ''")); assert(machine.includes('ai_shop_image_test')); assert(machine.includes('127.0.0.1:3014:3000')); assert(!machine.includes('ai_shop_dev'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('live developer lease prevents a concurrent switch and can be reacquired after release', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shop-local-lease-'));
  try {
    const result = execute(dir, `const release=acquireLocalLease(); assert.throws(()=>acquireLocalLease(),/active/);release();const second=acquireLocalLease();second();`);
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('unapproved or mutable candidate cannot start manual preview', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shop-local-reject-'));
  try {
    const result = execute(dir, `await assert.rejects(()=>activateLocalPreview({approved:false,imageId:'sha256:'+'a'.repeat(64)}),/accepted immutable/);await assert.rejects(()=>activateLocalPreview({approved:true,imageId:'ai-shop-app:latest'}),/accepted immutable/);`);
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('host-run development translates only the local HTTP Docker gateway without changing shared/container config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shop-model-address-'));
  try {
    writeEnv(join(dir, '.env'), { ...generateEnvironment('development'), SUPPORT_LLM_BASE_URL: 'http://host.docker.internal:8080/v1', SUPPORT_LLM_API_KEY: 'test-only' });
    const before = readFileSync(join(dir, '.env'), 'utf8');
    const result = execute(dir, `
      const shared=localRuntimeEnvironment(), host=localHostRuntimeEnvironment(shared);
      assert.equal(host.SUPPORT_LLM_BASE_URL,'http://127.0.0.1:8080/v1');
      assert.equal(host.SUPPORT_LLM_API_KEY,shared.SUPPORT_LLM_API_KEY);
      assert.equal(shared.SUPPORT_LLM_BASE_URL,'http://host.docker.internal:8080/v1');
      for (const base of ['https://host.docker.internal:8443/v1','https://model.example.invalid/v1','http://127.0.0.1:8080/v1','http://host.docker.internal.example.com/v1']) {
        assert.equal(localHostRuntimeEnvironment({...shared,SUPPORT_LLM_BASE_URL:base}).SUPPORT_LLM_BASE_URL,base);
      }
      const authenticated=new URL('http://host.docker.internal/v1');authenticated.username='test';authenticated.password='test';
      assert.equal(localHostRuntimeEnvironment({...shared,SUPPORT_LLM_BASE_URL:authenticated.toString()}).SUPPORT_LLM_BASE_URL,authenticated.toString());
      assert.equal(localHostRuntimeEnvironment({...shared,SUPPORT_LLM_BASE_URL:''}).SUPPORT_LLM_BASE_URL,'');
    `);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, '.env'), 'utf8'), before);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
