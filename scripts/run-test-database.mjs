import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const database = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
if (!process.env.TEST_DATABASE_URL) database.pathname = '/ai_shop_order_query_test';
if (!database.pathname.endsWith('_test')) throw new Error('测试数据库名必须以 _test 结尾');
const redis = new URL(process.env.TEST_REDIS_URL || process.env.REDIS_URL);
if (!process.env.TEST_REDIS_URL) redis.pathname = '/15';
if (redis.pathname !== '/15') throw new Error('集成测试只使用专用 Redis 15 库');
const env = { ...process.env, DATABASE_URL: database.toString(), REDIS_URL: redis.toString(), RUN_DATABASE_TESTS: '1', SMTP_HOST: '', MAIL_FROM: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', NODE_ENV: 'test', TRUST_PROXY: 'false' };
for (const args of [ ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/integration/security.test.ts'] ]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
