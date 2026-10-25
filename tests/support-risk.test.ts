import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientIpInfo } from '../src/lib/get-client-ip';
import { supportCost, reservationCost } from '../src/lib/support/budget';
import { usageWindow } from '../src/lib/support/admin';
import { riskKeys } from '../src/lib/support/risk';
import { supportLimitSnapshot } from '../src/lib/support/limits';
const rates={inputUsdPerMillion:0.1,cachedInputUsdPerMillion:0.01,cacheWriteUsdPerMillion:0.125,outputUsdPerMillion:0.5,usdCnyRate:7.2};
test('money uses sub-cent precision and missing usage is unknown',()=>{
  const usage={inputTokens:100,outputTokens:10,cachedTokens:20,cacheWriteTokens:0,reasoningTokens:4,totalTokens:110,responseModel:'test'};
  assert.equal(supportCost(usage,rates)?.toString(),'0.0000132');
  assert.equal(supportCost({...usage,inputTokens:null},rates),null);
  assert.equal(supportCost({...usage,cachedTokens:101},rates),null);
});
test('public proxy IPs are canonicalized; private/tunnel/forged identities stay unknown',()=>{
  const old=process.env.TRUST_PROXY;
  try{
    process.env.TRUST_PROXY='true';
    for(const ip of ['127.0.0.1','192.168.65.1','10.0.0.2','::1','fd00::1','::ffff:10.0.0.2','not-an-ip'])assert.deepEqual(getClientIpInfo({headers:new Headers({'x-real-ip':ip})}),{value:'unknown',trusted:false});
    assert.equal(getClientIpInfo({headers:new Headers({'x-real-ip':'2001:4860:0000:0000::8888'})}).value,'2001:4860::8888');
    assert.equal(getClientIpInfo({headers:new Headers({'cf-connecting-ip':'8.8.8.8'})}).trusted,false);
    process.env.TRUST_PROXY='false';assert.equal(getClientIpInfo({headers:new Headers({'x-real-ip':'8.8.8.8'})}).trusted,false);
  }finally{if(old===undefined)delete process.env.TRUST_PROXY;else process.env.TRUST_PROXY=old;}
});
test('date windows and quota keys change at Shanghai midnight; invalid windows rejected',()=>{
  const w=usageWindow({from:'2026-10-24',to:'2026-10-24'});assert.equal(w.start.toISOString(),'2026-10-23T16:00:00.000Z');assert.equal(w.end.toISOString(),'2026-10-24T16:00:00.000Z');
  assert.throws(()=>usageWindow({from:'2026-02-30'}));assert.throws(()=>usageWindow({from:'2026-10-24',to:'2026-10-23'}));
  const id={anonymousKey:'fixture'},ip={value:'unknown',trusted:false};
  assert.notEqual(riskKeys(id,ip,'商品',new Date('2026-10-24T15:59:59Z'))[4],riskKeys(id,ip,'商品',new Date('2026-10-24T16:00:00Z'))[4]);
});

test('support fixed safety policy exposes the documented read-only limits',()=>{
  const limits=supportLimitSnapshot();
  assert.deepEqual({planner:limits.plannerMaxOutputTokens,answer:limits.answerMaxOutputTokens,requestTimeout:limits.upstreamTimeoutMs,totalTimeout:limits.totalTimeoutMs,rounds:limits.maxModelRounds,tools:limits.maxToolCalls,identity:limits.identityConcurrent,ip:limits.ipConcurrent,global:limits.globalConcurrent,duplicateWindow:limits.duplicateWindowSeconds,duplicateThreshold:limits.duplicateThreshold,cooldown:limits.cooldownSeconds},{planner:256,answer:1000,requestTimeout:25000,totalTimeout:65000,rounds:4,tools:8,identity:1,ip:3,global:8,duplicateWindow:60,duplicateThreshold:4,cooldown:900});
});
