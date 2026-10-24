import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, lstatSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';

export const externalKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'XUNHU_ALIPAY_APPID', 'XUNHU_ALIPAY_APPSECRET', 'XUNHU_WECHAT_APPID', 'XUNHU_WECHAT_APPSECRET', 'USDT_TRC20_ADDRESS', 'TRONGRID_API_KEY', 'SUPPORT_LLM_API_KEY', 'SUPPORT_LLM_BASE_URL'];
export function readEnv(path) { return parseEnv(readFileSync(path, 'utf8')); }
export function writeEnv(path, values) {
  const body = Object.entries(values).map(([key, value]) => {
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || /[\r\n]/.test(value)) throw new Error('Invalid environment field');
    return `${key}=${JSON.stringify(String(value))}`;
  }).join('\n') + '\n';
  writeFileSync(path, body, { mode: 0o600 });
}
/** @returns {Record<string, string>} */
export function generateEnvironment(mode) {
  const test = mode === 'test';
  const password = randomBytes(24).toString('hex');
  return {
    APP_ENV: test ? 'test' : 'development',
    [test ? 'TEST_DB_PASSWORD' : 'DEV_DB_PASSWORD']: password,
    DATABASE_URL: `postgresql://aishop_${test ? 'test' : 'dev'}:${password}@127.0.0.1:${test ? 55441 : 55440}/${test ? 'ai_shop_security_test' : 'ai_shop_dev'}`,
    REDIS_URL: `redis://127.0.0.1:${test ? 16381 : 16380}/${test ? 15 : 0}`,
    NEXTAUTH_URL: test ? 'http://localhost:3011' : 'http://127.0.0.1:3013',
    NEXT_PUBLIC_SITE_URL: test ? 'http://localhost:3011' : 'http://127.0.0.1:3013',
    NEXT_PUBLIC_SITE_NAME: test ? 'AI Shop Test' : 'AI Shop Development',
    NEXTAUTH_SECRET: randomBytes(32).toString('hex'), ENCRYPTION_KEY: randomBytes(32).toString('hex'), CRON_SECRET: randomBytes(32).toString('hex'),
    ADMIN_PASSWORD: randomBytes(18).toString('hex'), AUTH_TRUST_HOST: 'true', TRUST_PROXY: 'false',
    ...Object.fromEntries(externalKeys.map(key => [key, ''])),
  };
}
export const environmentFiles = { development: '.env', test: '.deploy/test.env', production: '.deploy/production.env' };

function sameValues(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(key => a[key] === b[key]);
}

// Migrate only identical aliases. Conflicting files require an explicit choice,
// never silent precedence that could reconnect a developer to production.
export function initializeEnvironments() {
  const devFiles = ['.env', '.env.development.local', '.env.local'].filter(existsSync);
  const testFiles = ['.deploy/test.env', '.env.test.local'].filter(existsSync);
  const dev = devFiles.length ? readEnv(devFiles[0]) : generateEnvironment('development');
  const test = testFiles.length ? readEnv(testFiles[0]) : generateEnvironment('test');
  for (const file of devFiles) if (!sameValues(dev, readEnv(file))) throw new Error(`Conflicting development configuration: ${file}; no files changed`);
  for (const file of testFiles) if (!sameValues(test, readEnv(file))) throw new Error(`Conflicting test configuration: ${file}; no files changed`);
  assertIsolated(dev, 'development'); assertIsolated(test, 'test');
  mkdirSync('.deploy', { recursive: true, mode: 0o700 });
  if (!existsSync('.env')) writeEnv('.env', dev);
  if (!existsSync('.deploy/test.env')) writeEnv('.deploy/test.env', test);
  for (const file of ['.env.development.local', '.env.test.local', '.env.local']) {
    if (existsSync(file)) {
      // Copy symlink contents before archiving so backups remain readable.
      const archive = '.deploy/archive/environment-files';
      mkdirSync(archive, { recursive: true, mode: 0o700 });
      const target = `${archive}/${file.slice(1)}-${randomBytes(4).toString('hex')}`;
      if (lstatSync(file).isSymbolicLink()) writeEnv(target + '.snapshot', readEnv(file));
      renameSync(file, target);
    }
  }
}

export function configurationSummary() {
  const rows = [];
  for (const [mode, file] of Object.entries(environmentFiles)) {
    if (!existsSync(file)) { rows.push({ environment: mode, file, status: '未初始化' }); continue; }
    const env = readEnv(file);
    rows.push({ environment: mode, file, status: '已配置',
      modelKey: env.SUPPORT_LLM_API_KEY ? '已填写（未做连通性检测）' : '未填写',
      managed: mode === 'test' ? '自动管理，无需编辑' : '手动配置入口' });
  }
  return rows;
}
export function assertIsolated(env, mode, ci = false) {
  const db = new URL(env.DATABASE_URL); const redis = new URL(env.REDIS_URL);
  const local = url => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!local(db) || !local(redis)) throw new Error('Isolated commands require local development/test services');
  if (mode === 'test') {
    if (!db.pathname.endsWith('_test') || redis.pathname !== '/15') throw new Error('Tests require a _test database and Redis DB 15');
    if (!ci && (db.port !== '55441' || redis.port !== '16381' || db.username !== 'aishop_test')) throw new Error('Tests must use the separate ai-shop-test containers');
  } else if (db.pathname !== '/ai_shop_dev' || db.port !== '55440' || db.username !== 'aishop_dev' || redis.port !== '16380' || redis.pathname !== '/0') {
    throw new Error('Development must use the separate ai-shop-dev containers');
  }
  // Manual development may use its support model and image upload service. Machine tests still
  // reject all external credentials; payment and notification keys stay blocked.
  const allowed = mode === 'development' ? ['SUPPORT_LLM_API_KEY', 'SUPPORT_LLM_BASE_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] : [];
  if (externalKeys.some(key => env[key] && !allowed.includes(key))) throw new Error('External credentials are disabled in isolated environments');
}
/** @param {string} mode @param {Record<string, string|undefined>} [inherited] @returns {Record<string, string>} */
export function isolatedEnvironment(mode = 'development', inherited = process.env) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USER', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'LANG', 'LC_ALL', 'TERM', 'DOCKER_HOST', 'DOCKER_CONTEXT']) if (inherited[key]) env[key] = inherited[key];
  const ci = inherited.GITHUB_ACTIONS === 'true' && mode === 'test';
  const file = environmentFiles[mode];
  if (!file || mode === 'production') throw new Error('Use explicit release workflow for production');
  if (ci) {
    Object.assign(env, generateEnvironment('test'), { DATABASE_URL: inherited.TEST_DATABASE_URL, REDIS_URL: inherited.TEST_REDIS_URL });
  } else {
    if (!existsSync(file)) throw new Error('Run npm run env:init before local development or tests');
    Object.assign(env, readEnv(file));
  }
  assertIsolated(env, mode, ci);
  // Prevent Next from merging .env.local / production credentials into this subprocess.
  if (ci) env.GITHUB_ACTIONS = 'true';
  env.__NEXT_PROCESSED_ENV = 'true'; env.APP_ENV = mode; env.NEXT_TELEMETRY_DISABLED = '1';
  if (mode === 'test') { env.TEST_DATABASE_URL = env.DATABASE_URL; env.TEST_REDIS_URL = env.REDIS_URL; }
  return env;
}
