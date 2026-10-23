import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { isolatedEnvironment } from './environments.mjs';

export const LOCAL_ORIGIN = 'http://127.0.0.1:3013';
export const LOCAL_PORT = 3013;
export const localCompose = ['compose', '--env-file', '.env', '-p', 'ai-shop-dev', '-f', 'docker-compose.yml', '--profile', 'preview'];

// Hold this lease for the host dev server's entire lifetime, or for an entire
// release preparation/switch. Never terminate an arbitrary process on the port.
export function acquireLocalLease() {
  mkdirSync('.deploy', { recursive: true, mode: 0o700 });
  const path = '.deploy/local-runtime.lock';
  if (existsSync(path)) {
    const previous = readFileSync(path, 'utf8');
    const pid = Number(previous);
    if (!Number.isInteger(pid) || pid < 1) throw new Error('Invalid local-runtime lock; inspect it before retrying');
    try { process.kill(pid, 0); throw new Error('Local development or a version switch is active. Stop it before switching modes.'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    if (readFileSync(path, 'utf8') !== previous) throw new Error('Local runtime changed; retry');
    unlinkSync(path);
  }
  const fd = openSync(path, 'wx', 0o600); writeFileSync(fd, String(process.pid)); closeSync(fd);
  let released = false;
  return () => { if (!released && existsSync(path) && readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path); released = true; };
}

export function localRuntimeEnvironment() {
  const env = isolatedEnvironment('development');
  if (env.NEXTAUTH_URL !== LOCAL_ORIGIN || env.NEXT_PUBLIC_SITE_URL !== LOCAL_ORIGIN) throw new Error(`Local NEXTAUTH_URL and NEXT_PUBLIC_SITE_URL must both be ${LOCAL_ORIGIN}`);
  return env;
}

export function localDocker(args, env = localRuntimeEnvironment()) {
  return execFileSync('docker', [...localCompose, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export async function ensureLocalPortFree() {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error('Port 3013 is occupied. Stop the previous local server before switching; no process was terminated.')));
    server.listen(LOCAL_PORT, '127.0.0.1', () => server.close(resolve));
  });
}

export async function localHealth() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { const r = await fetch(`${LOCAL_ORIGIN}/api/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok && (await r.json()).status === 'ok') return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Local candidate failed its health check; production is unaffected');
}

export function recordLocalMode(mode, details = {}) {
  mkdirSync('.deploy', { recursive: true, mode: 0o700 });
  writeFileSync('.deploy/local-mode.json', JSON.stringify({ mode, origin: LOCAL_ORIGIN, ...details, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
}

// Caller must hold acquireLocalLease(). Immutable image already passed isolated
// gates. No seed, restore, production connection or dependency recreation here.
export async function activateLocalPreview(manifest) {
  if (!manifest.approved || !/^sha256:[a-f0-9]{64}$/.test(manifest.imageId || '')) throw new Error('Only an accepted immutable candidate may enter manual preview');
  const env = { ...localRuntimeEnvironment(), AI_SHOP_CANDIDATE_IMAGE: manifest.imageId };
  localDocker(['up', '-d', '--wait', 'postgres', 'redis'], env);
  localDocker(['stop', 'app'], env);
  await ensureLocalPortFree();
  const dir = '.deploy/local-backups'; mkdirSync(dir, { recursive: true, mode: 0o700 });
  const backup = `${dir}/${Date.now()}.dump`;
  const fd = openSync(backup, 'wx', 0o600);
  let result;
  try { result = spawnSync('docker', [...localCompose, 'exec', '-T', 'postgres', 'pg_dump', '-U', 'aishop_dev', '-d', 'ai_shop_dev', '-Fc'], { env, stdio: ['ignore', fd, 'pipe'] }); }
  finally { closeSync(fd); }
  if (result.status !== 0) throw new Error('Local backup failed; no migration started');
  recordLocalMode('switching', { releaseId: manifest.id, backup });
  try {
    localDocker(['run', '--rm', '--no-deps', 'app', 'node', 'scripts/prepare-database.mjs'], env);
    localDocker(['up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'], env);
    await localHealth();
    recordLocalMode('preview', { releaseId: manifest.id, imageId: manifest.imageId, backup });
  } catch (error) { recordLocalMode('needs-attention', { releaseId: manifest.id, backup }); throw error; }
}
