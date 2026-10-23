import { spawnSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { acquireLocalLease, localRuntimeEnvironment, localDocker, ensureLocalPortFree, recordLocalMode, LOCAL_PORT } from './lib/local-runtime.mjs';
import { initializeEnvironments, isolatedEnvironment, generateEnvironment, configurationSummary } from './lib/environments.mjs';

const [action, ...extra] = process.argv.slice(2);
if (extra.length) throw new Error('This command does not accept arbitrary command arguments');
function run(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (action === 'init') { initializeEnvironments(); console.log('配置已整理：本地 .env；线上 .deploy/production.env；测试自动管理。'); }
else if (action === 'status') console.table(configurationSummary());
else {
  const mode = ['test-up', 'test-down', 'integration', 'http'].includes(action) ? 'test' : 'development';
  // Container builds have no local config and must never need production secrets.
  const env = action === 'build' && !existsSync('.env')
    ? { PATH: process.env.PATH, HOME: process.env.HOME, ...generateEnvironment('development'), DATABASE_URL: 'postgresql://temp:temp@localhost:5432/temp', NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3013', __NEXT_PROCESSED_ENV: 'true', NEXT_TELEMETRY_DISABLED: '1' }
    : isolatedEnvironment(mode);
  const compose = ['compose', '--env-file', mode === 'test' ? '.deploy/test.env' : '.env', '-p', mode === 'test' ? 'ai-shop-test' : 'ai-shop-dev', '-f', mode === 'test' ? 'docker-compose.test.yml' : 'docker-compose.yml'];
  if (action === 'up' || action === 'test-up') run('docker', [...compose, 'up', '-d', '--wait', 'postgres', 'redis'], env);
  else if (action === 'down' || action === 'test-down') run('docker', [...compose, 'down'], env);
  else if (action === 'dev' || action === 'start') {
    const release = acquireLocalLease();
    try {
      const runtimeEnv = localRuntimeEnvironment();
      localDocker(['stop', 'app'], runtimeEnv);
      await ensureLocalPortFree();
      if (action === 'dev') runtimeEnv.NEXT_DEV_ISOLATED = '1';
      recordLocalMode(action === 'dev' ? 'development' : 'local-build', { pid: process.pid });
      const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', action === 'dev' ? 'dev' : 'start', '-H', '127.0.0.1', '-p', String(LOCAL_PORT)], { env: runtimeEnv, stdio: 'inherit' });
      for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
      const done = code => { recordLocalMode('stopped'); release(); process.exit(code || 0); };
      child.on('exit', done); child.on('error', () => done(1));
    } catch (error) { release(); throw error; }
  } else if (action === 'build') run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], env);
  else if (action === 'generate') run(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], env);
  else if (action === 'baseline') run(process.execPath, ['scripts/prepare-database.mjs', '--baseline-only'], env);
  else if (action === 'migrate') run(process.execPath, ['scripts/prepare-database.mjs'], env);
  else if (action === 'push') run(process.execPath, ['node_modules/prisma/build/index.js', 'db', 'push'], env);
  else if (action === 'studio') run(process.execPath, ['node_modules/prisma/build/index.js', 'studio', '--hostname', '127.0.0.1'], env);
  else if (action === 'seed') run(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], env);
  else if (action === 'integration') run(process.execPath, ['scripts/run-test-database.mjs'], env);
  else if (action === 'http') run(process.execPath, ['scripts/smoke-security.mjs'], env);
  else throw new Error('Unknown isolated environment action');
}
