import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const consumer = createRequire(require.resolve('@typescript-eslint/typescript-estree'));
const { minimatch } = consumer('minimatch');

test('typescript-eslint default-project patterns retain bounded, dot-aware path matching', () => {
  // Independent expectations for the exact API used by typescript-estree.
  for (const [file, pattern, expected] of [
    ['.config.ts', '*.ts', true], ['src/file.ts', '*.ts', false],
    ['src/file.ts', 'src/**/*.ts', true], ['src/app/page.tsx', 'src/**/*.{ts,tsx}', true],
    ['tests/unit/a.test.ts', 'tests/**/*.test.ts', true], ['src/file.js', 'src/**/*.ts', false],
    ['src/.hidden.ts', 'src/**/*.ts', true], ['文件.ts', '*.ts', true],
    ['src/目录/a.ts', 'src/**/*.ts', true], ['foo.ts', '+(foo|bar).ts', true],
    ['baz.ts', '+(foo|bar).ts', false], ['README.md', '*.ts', false],
  ] as const) assert.equal(minimatch(file, pattern, { dot: true }), expected, `${file} / ${pattern}`);
});
