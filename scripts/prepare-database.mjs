import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const db = new PrismaClient();
function prisma(args, capture = false) {
  const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { env: process.env, stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(capture ? '数据库与旧版结构不一致，请先核对差异并备份；未标记基线。' : '数据库迁移失败，请查看诊断。');
}
try {
  const [state] = await db.$queryRaw`SELECT to_regclass('public."Order"') IS NOT NULL AS existing, to_regclass('public._prisma_migrations') IS NOT NULL AS migrated`;
  if (state.existing && !state.migrated) {
    prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/migrations/20260101000000_baseline/schema.prisma', '--exit-code'], true);
    prisma(['migrate', 'resolve', '--applied', '20260101000000_baseline']);
  }
  if (!process.argv.includes('--baseline-only')) prisma(['migrate', 'deploy']);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
