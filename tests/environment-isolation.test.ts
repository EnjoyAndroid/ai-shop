import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateEnvironment, assertIsolated, isolatedEnvironment } from '../scripts/lib/environments.mjs';
import { assertDeployable, requiredGates } from '../scripts/lib/release-policy.mjs';

test('development and test targets cannot point at production ports, even with renamed databases', () => {
  const dev = generateEnvironment('development');
  const acceptance = generateEnvironment('test');
  assert.doesNotThrow(() => assertIsolated(dev, 'development'));
  assert.doesNotThrow(() => assertIsolated(acceptance, 'test'));
  for (const target of [
    { ...acceptance, DATABASE_URL: 'postgresql://aishop_test:test-only@127.0.0.1:55439/renamed_test' },
    { ...acceptance, REDIS_URL: 'redis://127.0.0.1:16379/15' },
    { ...acceptance, DATABASE_URL: 'postgresql://aishop:test-only@example.invalid:5432/renamed_test' },
    { ...acceptance, SUPPORT_LLM_API_KEY: 'test-only-paid-provider' },
  ]) assert.throws(() => assertIsolated(target, 'test'));
  assert.throws(() => assertIsolated({ ...dev, DATABASE_URL: 'postgresql://aishop:test-only@127.0.0.1:55439/ai_shop' }, 'development'));
});

test('CI test environment drops inherited production and paid-service credentials', () => {
  const env = isolatedEnvironment('test', { GITHUB_ACTIONS: 'true', PATH: process.env.PATH, TEST_DATABASE_URL: 'postgresql://aishop:test-only@localhost:5432/ai_shop_security_test', TEST_REDIS_URL: 'redis://localhost:6379/15', SUPPORT_LLM_API_KEY: 'test-only-secret', SMTP_PASS: 'test-only-secret', ENCRYPTION_KEY: 'test-only-production-key' });
  assert.equal(env.SUPPORT_LLM_API_KEY, ''); assert.equal(env.SMTP_PASS, '');
  assert.notEqual(env.ENCRYPTION_KEY, 'test-only-production-key');
  assert.equal(env.__NEXT_PROCESSED_ENV, 'true');
  assert.equal(env.GITHUB_ACTIONS, 'true');
});

test('deployment rejects failed gates, changed source and substituted images', () => {
  const image = 'sha256:' + 'a'.repeat(64);
  const manifest = { schema: 1, approved: true, sourceHash: 'test-source', imageId: image, gates: Object.fromEntries(requiredGates.map(g => [g, 'passed'])) };
  assert.doesNotThrow(() => assertDeployable(manifest, 'test-source', image));
  assert.throws(() => assertDeployable({ ...manifest, approved: false }, 'test-source', image));
  assert.throws(() => assertDeployable({ ...manifest, gates: { ...manifest.gates, audit: 'failed' } }, 'test-source', image));
  assert.throws(() => assertDeployable(manifest, 'changed-source', image));
  assert.throws(() => assertDeployable(manifest, 'test-source', 'sha256:' + 'b'.repeat(64)));
});

test('default compose cannot name or mount production resources and runtime startup does not migrate', () => {
  const dev = readFileSync('docker-compose.yml', 'utf8');
  assert(!/container_name|external:|\.deploy|ai-shop_postgres_data|ai-shop_redis_data/.test(dev));
  assert(dev.includes('name: ai-shop-dev'));
  const production = readFileSync('docker-compose.production.yml', 'utf8');
  assert(!/\bbuild:/.test(production));
  assert(production.includes('127.0.0.1:3010:80'));
  assert(production.includes('./.deploy/nginx.production.conf'));
  assert(readFileSync('Dockerfile', 'utf8').includes('CMD ["node", "server.js"]'));
});

test('actual test entrypoints reject a conflicting TEST_DATABASE_URL before opening a database', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const script of ['scripts/run-test-database.mjs', 'scripts/smoke-security.mjs']) {
    const env = { ...process.env, ...generateEnvironment('test'), TEST_DATABASE_URL: 'postgresql://aishop_test:test-only@127.0.0.1:55439/renamed_test', GITHUB_ACTIONS: '' };
    const result = spawnSync(process.execPath, [script], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /separate ai-shop-test/);
    assert(!result.stderr.includes('PrismaClientInitializationError'));
  }
});


test('manual development permits model and image upload, while machine tests reject external services', () => {
  const dev = { ...generateEnvironment('development'), SUPPORT_LLM_API_KEY: 'test-only-model-key', SUPPORT_LLM_BASE_URL: 'https://model.example.invalid/v1', CLOUDINARY_CLOUD_NAME: 'test-only-cloud', CLOUDINARY_API_KEY: 'test-only-api-key', CLOUDINARY_API_SECRET: 'test-only-upload-secret' };
  assert.doesNotThrow(() => assertIsolated(dev, 'development'));
  for (const key of ['SMTP_PASS', 'TELEGRAM_BOT_TOKEN', 'XUNHU_ALIPAY_APPSECRET', 'USDT_TRC20_ADDRESS']) {
    assert.throws(() => assertIsolated({ ...dev, [key]: 'test-only-external-key' }, 'development'));
  }
  assert.throws(() => assertIsolated({ ...generateEnvironment('test'), SUPPORT_LLM_API_KEY: dev.SUPPORT_LLM_API_KEY }, 'test'));
  assert.throws(() => assertIsolated({ ...generateEnvironment('test'), SUPPORT_LLM_BASE_URL: dev.SUPPORT_LLM_BASE_URL }, 'test'));
  for (const key of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const) {
    assert.throws(() => assertIsolated({ ...generateEnvironment('test'), [key]: dev[key] }, 'test'));
  }
});
