import test from 'node:test';
import assert from 'node:assert/strict';
import { occupiedCny, reserveEvaluation, settleEvaluation, type EvalLedger } from '../scripts/support-eval/budget';
import type { SupportConfig } from '../src/lib/support/config';
const config:SupportConfig={provider:'test',baseUrl:'https://example.invalid/v1',apiKey:'synthetic-key',model:'test',wireApi:'responses',dailyBudgetCny:1,usdCnyRate:1,inputUsdPerMillion:1,cachedInputUsdPerMillion:1,cacheWriteUsdPerMillion:1,outputUsdPerMillion:1};
test('evaluation reserves before sending and never frees unknown or failed-call fees',()=>{
  const ledger:EvalLedger={ceilingCny:0.01,calls:[]};
  const start={phase:'scope' as const,sequence:1,maxOutputTokens:100,body:{input:'synthetic'}};
  assert(reserveEvaluation(ledger,start,config,'unknown'));
  const reserved=occupiedCny(ledger).toNumber();assert(reserved>0);
  const usage={inputTokens:null,outputTokens:null,cachedTokens:null,cacheWriteTokens:null,reasoningTokens:null,totalTokens:null,responseModel:null};
  settleEvaluation(ledger,{phase:'scope',sequence:1,latencyMs:1,callId:'unknown',sent:true,success:false,usage},config);
  assert.equal(occupiedCny(ledger).toNumber(),reserved);assert.equal(ledger.calls[0].state,'uncertain');
  assert(reserveEvaluation(ledger,start,config,'known'));
  settleEvaluation(ledger,{phase:'scope',sequence:1,latencyMs:1,callId:'known',sent:true,success:false,usage:{...usage,inputTokens:100,outputTokens:50}},config);
  assert.equal(ledger.calls[1].settled,'0.00015');
  assert.throws(()=>settleEvaluation(ledger,{phase:'scope',sequence:1,latencyMs:1,callId:'known',success:true,usage},config));
  while(reserveEvaluation(ledger,start,config,`call-${ledger.calls.length}`)){}
  assert(occupiedCny(ledger).lte(ledger.ceilingCny));assert.equal(reserveEvaluation(ledger,start,config,'blocked'),false);
});
