import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, copyFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { readEnv, writeEnv, isolatedEnvironment } from './lib/environments.mjs';
import { acquireLocalLease, activateLocalPreview, LOCAL_ORIGIN } from './lib/local-runtime.mjs';
import { sourceFingerprint, assertDeployable, releaseName } from './lib/release-policy.mjs';

const [action, requested, confirmation] = process.argv.slice(2);
if (!['prepare', 'deploy', 'rollback'].includes(action)) throw new Error('Use prepare, deploy <release> --confirm-production or rollback <deployment> --confirm-production');
if (action !== 'prepare' && confirmation !== '--confirm-production') throw new Error('Production changes require --confirm-production and explicit user authorization');
mkdirSync('.deploy/releases', { recursive: true, mode: 0o700 });
mkdirSync('.deploy/deployments', { recursive: true, mode: 0o700 });
const releaseLocal = action === 'prepare' ? acquireLocalLease() : () => {};
let lock;
try { lock = openSync('.deploy/release.lock', 'wx', 0o600); } catch (error) { releaseLocal(); throw error; }
writeFileSync(lock, String(process.pid));
const productionFiles = ['--env-file', '.deploy/production.env', '--env-file', '.deploy/production-images.env', '-p', 'ai-shop', '-f', 'docker-compose.production.yml'];
function docker(args, env = process.env) {
  return execFileSync('docker', args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function save(path, value) { writeFileSync(path + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(path + '.tmp', path); }
function timestamp() { return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14); }
async function health(url) {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'error' }); if (r.ok && (await r.json()).status === 'ok') return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Health check failed: ' + url);
}
function production() {
  if (!existsSync('.deploy/production.env') || !existsSync('.deploy/production-images.env')) throw new Error('Production configuration has not been adopted');
  // Do not let shell/default .env values override the isolated production env files.
  const env = {};
  for (const key of ['PATH', 'HOME', 'USER', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'LANG', 'LC_ALL', 'TERM', 'DOCKER_HOST', 'DOCKER_CONTEXT']) if (process.env[key]) env[key] = process.env[key];
  env.APP_ENV = 'production';
  // Compose reads application values only from the explicit .deploy env files.
  // Do not inherit the developer's NEXTAUTH_URL, database URL or API credentials.
  return env;
}
function updateApp(imageId) {
  const values = readEnv('.deploy/production-images.env'); values.AI_SHOP_APP_IMAGE = imageId;
  writeEnv('.deploy/production-images.env', values);
  docker(['compose', ...productionFiles, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'], production());
  // app may acquire a new container IP; reload only the existing proxy process.
  docker(['exec', 'ai-shop-nginx', 'nginx', '-t']);
  docker(['exec', 'ai-shop-nginx', 'nginx', '-s', 'reload']);
}
try {
  if (action === 'prepare') {
    if (requested) throw new Error('prepare generates an immutable ID; no arguments accepted');
    const sourceHash = sourceFingerprint();
    const id = `${timestamp()}-${sourceHash.slice(0, 12)}`;
    const directory = `.deploy/releases/${id}`; mkdirSync(directory, { mode: 0o700 });
    const manifest = { schema: 1, id, sourceHash, createdAt: new Date().toISOString(), approved: false, gates: {} };
    const manifestPath = `${directory}/manifest.json`;
    const env = isolatedEnvironment('test');
    function gate(name, executable, args, childEnv = env) {
      const log = openSync(`${directory}/${name}.log`, 'w', 0o600);
      console.log(`Checking ${name}…`);
      let result;
      try { result = spawnSync(executable, args, { env: childEnv, stdio: ['ignore', log, log] }); } finally { closeSync(log); }
      manifest.gates[name] = result.status === 0 ? 'passed' : 'failed'; save(manifestPath, manifest);
      if (result.status !== 0) throw new Error(`${name} failed; see ${directory}/${name}.log. Production was not changed.`);
    }
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    gate('install', npm, ['ci']);
    gate('generate', process.execPath, ['node_modules/prisma/build/index.js', 'generate']);
    gate('unit', npm, ['test']);
    gate('integration', process.execPath, ['scripts/run-test-database.mjs']);
    gate('build', process.execPath, ['node_modules/next/dist/bin/next', 'build']);
    gate('http', process.execPath, ['scripts/smoke-security.mjs']);
    gate('secrets', npm, ['run', 'check:secrets']);
    gate('history', npm, ['run', 'check:history']);
    gate('diff', 'git', ['diff', '--check']);
    const publicEnv = existsSync('.deploy/production.env') ? readEnv('.deploy/production.env') : {};
    const tag = `ai-shop-release:${id}`;
    gate('image', 'docker', ['build', '--tag', tag, '--build-arg', `NEXT_PUBLIC_SITE_URL=${publicEnv.NEXT_PUBLIC_SITE_URL || 'http://localhost:3013'}`, '--build-arg', `NEXT_PUBLIC_SITE_NAME=${publicEnv.NEXT_PUBLIC_SITE_NAME || 'AI Shop'}`, '.']);
    manifest.imageId = docker(['image', 'inspect', tag, '--format', '{{.Id}}']); manifest.imageTag = tag;
    const testEnv = { ...env, AI_SHOP_CANDIDATE_IMAGE: manifest.imageId };
    // Machine acceptance stays separate from the shared local/manual data.
    const testCompose = ['compose', '--env-file', '.deploy/test.env', '-p', 'ai-shop-test', '-f', 'docker-compose.test.yml', '--profile', 'verification'];
    const previewExists = docker([...testCompose, 'exec', '-T', 'postgres', 'psql', '-U', 'aishop_test', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='ai_shop_image_test'"], testEnv);
    if (previewExists !== '1') docker([...testCompose, 'exec', '-T', 'postgres', 'createdb', '-U', 'aishop_test', 'ai_shop_image_test'], testEnv);
    docker([...testCompose, 'run', '--rm', '--no-deps', 'app', 'node', 'scripts/prepare-database.mjs'], testEnv);
    docker([...testCompose, 'up', '-d', '--no-deps', '--no-build', '--pull', 'never', 'app'], testEnv);
    try { await health('http://127.0.0.1:3014/api/health'); manifest.gates.preview = 'passed'; }
    catch (e) { manifest.gates.preview = 'failed'; throw e; }
    finally { save(manifestPath, manifest); docker([...testCompose, 'stop', 'app'], testEnv); }
    gate('audit', npm, ['run', 'audit:security']);
    if (sourceFingerprint() !== sourceHash) throw new Error('Source changed during acceptance; release not approved');
    manifest.approved = true; manifest.verifiedAt = new Date().toISOString(); save(manifestPath, manifest);
    await activateLocalPreview(manifest);
    console.log(`Release ${id} is ready at ${LOCAL_ORIGIN}. Production unchanged.\nAfter explicit authorization: npm run release:deploy -- ${id} --confirm-production`);
  } else if (action === 'deploy') {
    const id = releaseName(requested);
    const manifest = JSON.parse(readFileSync(`.deploy/releases/${id}/manifest.json`, 'utf8'));
    assertDeployable(manifest, sourceFingerprint(), docker(['image', 'inspect', manifest.imageId, '--format', '{{.Id}}']));
    const env = production();
    const active = docker(['inspect', 'ai-shop-app', '--format', '{{.Image}}']);
    const dbImage = docker(['inspect', 'ai-shop-db', '--format', '{{.Image}}']);
    const pinned = readEnv('.deploy/production-images.env');
    if (dbImage !== pinned.AI_SHOP_POSTGRES_IMAGE) throw new Error('Production database image drift; no automatic recreation');
    const deploymentId = `${timestamp()}-${randomBytes(3).toString('hex')}`;
    const dir = `.deploy/deployments/${deploymentId}`; mkdirSync(dir, { mode: 0o700 });
    copyFileSync('.deploy/production.env', `${dir}/production.env`);
    copyFileSync('.deploy/nginx.production.conf', `${dir}/nginx.conf`);
    const dump = openSync(`${dir}/before.dump`, 'wx', 0o600);
    let backup;
    try { backup = spawnSync('docker', ['exec', 'ai-shop-db', 'pg_dump', '-U', 'aishop', '-d', 'ai_shop', '-Fc'], { stdio: ['ignore', dump, 'pipe'], env }); } finally { closeSync(dump); }
    if (backup.status !== 0) throw new Error('Backup failed; migration/deployment was not started');
    const record = { id: deploymentId, release: id, previousImage: active, nextImage: manifest.imageId, status: 'backed-up', startedAt: new Date().toISOString() };
    save(`${dir}/deployment.json`, record);
    // Explicit migration using the accepted image. Never seed or recreate dependencies.
    writeEnv(`${dir}/candidate.env`, { AI_SHOP_APP_IMAGE: manifest.imageId });
    try {
      docker(['compose', ...productionFiles, '--env-file', `${dir}/candidate.env`, 'run', '--rm', '--no-deps', '-e', 'AI_SHOP_DEPLOY_AUTHORIZED=1', 'app', 'node', 'scripts/prepare-database.mjs'], env);
      record.status = 'migrated'; save(`${dir}/deployment.json`, record);
      updateApp(manifest.imageId);
      await health('http://127.0.0.1:3010/api/health');
      await health(new URL('/api/health', readEnv('.deploy/production.env').NEXTAUTH_URL).href);
      record.status = 'deployed'; save(`${dir}/deployment.json`, record);
      console.log(`Deployed ${id}. Rollback record: ${deploymentId}`);
    } catch (error) {
      record.failureStage = record.status; record.status = 'needs-attention'; save(`${dir}/deployment.json`, record);
      throw new Error(`Deployment stopped. Record ${deploymentId}; no database restore or down-migration was attempted. ${error.message}`);
    }
  } else {
    const id = releaseName(requested);
    const record = JSON.parse(readFileSync(`.deploy/deployments/${id}/deployment.json`, 'utf8'));
    const active = docker(['inspect', 'ai-shop-app', '--format', '{{.Image}}']);
    if (active !== record.nextImage) throw new Error('Active image differs from this deployment; refusing stale rollback');
    docker(['image', 'inspect', record.previousImage, '--format', '{{.Id}}']);
    // Caller must first review schema backward compatibility. Database is never restored automatically.
    updateApp(record.previousImage); await health('http://127.0.0.1:3010/api/health');
    await health(new URL('/api/health', readEnv('.deploy/production.env').NEXTAUTH_URL).href);
    record.status = 'application-rolled-back'; save(`.deploy/deployments/${id}/deployment.json`, record);
    console.log('Previous application image restored. Database kept intact.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { closeSync(lock); unlinkSync('.deploy/release.lock'); releaseLocal(); }
