// One-time adoption of the existing deployment, without restarting application or data services.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, chmodSync, renameSync } from 'node:fs';
import { readEnv, writeEnv, initializeEnvironments, generateEnvironment } from './lib/environments.mjs';
if (process.argv[2] !== '--confirm-production') throw new Error('Explicit production adoption required');
if (existsSync('.deploy/production.env')) throw new Error('Production snapshot already exists; refusing overwrite');
mkdirSync('.deploy', { recursive: true, mode: 0o700 });
mkdirSync('.deploy/archive', { recursive: true, mode: 0o700 });
const names = ['ai-shop-app', 'ai-shop-db', 'ai-shop-redis', 'ai-shop-nginx'];
const containers = JSON.parse(execFileSync('docker', ['inspect', ...names], { encoding: 'utf8' }));
const [app, db, redis, nginx] = containers;
if (!app.State.Running || !db.State.Running || !redis.State.Running || !nginx.State.Running) throw new Error('Expected running production baseline');
if (!db.Mounts.some(m => m.Name === 'ai-shop_postgres_data') || !redis.Mounts.some(m => m.Name === 'ai-shop_redis_data')) throw new Error('Unexpected production volumes');
const values = Object.fromEntries(app.Config.Env.map(pair => { const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i+1)]; }));
const original = readEnv('.env');
copyFileSync('.env', '.deploy/archive/legacy-production.env'); chmodSync('.deploy/archive/legacy-production.env', 0o600);
if (existsSync('.env.local')) { copyFileSync('.env.local', '.deploy/archive/legacy-production-local.env'); chmodSync('.deploy/archive/legacy-production-local.env', 0o600); }
const selected = { ...original, ...Object.fromEntries(Object.entries(values).filter(([key]) => key in original)), APP_ENV: 'production' };
writeEnv('.deploy/production.env', selected);
const images = { AI_SHOP_APP_IMAGE: app.Image, AI_SHOP_POSTGRES_IMAGE: db.Image, AI_SHOP_REDIS_IMAGE: redis.Image, AI_SHOP_NGINX_IMAGE: nginx.Image };
writeEnv('.deploy/production-images.env', images);
copyFileSync('nginx.conf', '.deploy/nginx.production.conf'); chmodSync('.deploy/nginx.production.conf', 0o600);
writeFileSync('.deploy/production-baseline.json', JSON.stringify({ capturedAt: new Date().toISOString(), containers: containers.map(c => ({ name: c.Name, id: c.Id, image: c.Image, startedAt: c.State.StartedAt })), images }, null, 2), { mode: 0o600 });
// Archive the former defaults before initializing the single development file.
mkdirSync('.deploy/archive', { recursive: true, mode: 0o700 });
if (existsSync('.env.local')) renameSync('.env.local', '.deploy/archive/captured-env-local');
renameSync('.env', '.deploy/archive/captured-env');
if (existsSync('.env.development.local')) writeEnv('.env', readEnv('.env.development.local'));
else writeEnv('.env', generateEnvironment('development'));
initializeEnvironments();
console.log('Production config saved privately; .env is isolated development. No container changed.');
