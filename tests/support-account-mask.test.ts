import test from 'node:test';
import assert from 'node:assert/strict';
import { maskSupportAccount } from '../src/lib/support/account-mask';

test('support accounts hide short local parts and Unicode names without revealing entire names',()=>{
  for (const [input,expected] of [
    ['alice@example.com','al***@example.com'],['ab@example.com','a***@example.com'],
    ['a@example.com','***@example.com'],['张三','张***'],['张','***'],['😀小明','😀小***'],
    ['',null],[null,null],[undefined,null],
  ] as const) assert.equal(maskSupportAccount(input),expected);
});
