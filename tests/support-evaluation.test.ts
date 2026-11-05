import test from 'node:test';
import { evaluationFailure } from '../src/lib/support/evaluation/diagnostics';
import assert from 'node:assert/strict';
import { supportEvaluationEnabled } from '../src/lib/support/evaluation/access';
import { fixtureHistory, fixtureTool } from '../src/lib/support/evaluation/fixtures';
import { evalMemory, historyForSide, runEvalSide } from '../src/lib/support/evaluation/runner';
import { SUPPORT_INSTRUCTIONS as oldAnswer } from '../src/lib/support/evaluation/baseline/policy';
import { SUPPORT_INSTRUCTIONS as newAnswer } from '../src/lib/support/policy';
import type { EvalSession } from '../src/lib/support/evaluation/types';
import type { SupportConfig } from '../src/lib/support/config';
const config:SupportConfig={provider:'test',baseUrl:'https://example.invalid/v1',model:'same-model',wireApi:'responses',apiKey:'synthetic',dailyBudgetCny:10,usdCnyRate:7.2,inputUsdPerMillion:0.1,cachedInputUsdPerMillion:0.01,cacheWriteUsdPerMillion:0.125,outputUsdPerMillion:0.5};
const usage={input_tokens:20,output_tokens:10,total_tokens:30};
function harness(wire:SupportConfig['wireApi']) {
  const bodies:any[]=[], reservations:any[]=[], settled:any[]=[];
  return {bodies,reservations,settled, input:{config:{...config,wireApi:wire},
    reserve:async(start:any)=>{reservations.push(start);return {callId:`test-${reservations.length}`,amountCny:0.01};},
    settle:async(record:any)=>{settled.push(record);},
    fetcher:(async(_url,options)=>{
      const body=JSON.parse(String(options?.body));bodies.push(body);
      const planning=(body.instructions||body.messages[0].content).includes('查询参数定义');
      const text=planning?JSON.stringify({decision:'allow',queries:[{name:'search_products',arguments:{query:'ChatGPT'}}]}):'套餐99元，有货。';
      return new Response(JSON.stringify(wire==='responses'?{output_text:text,usage,model:'same-model'}:{choices:[{message:{role:'assistant',content:text}}],usage,model:'same-model'}));
    }) as typeof fetch,
  }};
}
test('evaluation is closed in production, missing APP_ENV or public origin',()=>{
  for(const env of [{APP_ENV:'production',NEXTAUTH_URL:'http://127.0.0.1:3010'},{NEXTAUTH_URL:'http://localhost:3013'},{APP_ENV:'development',NEXTAUTH_URL:'https://shop.example'}])assert(!supportEvaluationEnabled(env));
  assert(supportEvaluationEnabled({APP_ENV:'development',NEXTAUTH_URL:'http://127.0.0.1:3013'}));
  assert(supportEvaluationEnabled({APP_ENV:'test',NEXTAUTH_URL:'http://localhost:3011'}));
});
test('synthetic fixtures are deterministic, distinguish failures and cannot accept write or identity parameters',()=>{
  assert.deepEqual(fixtureTool('shopping','search_products',{query:'ChatGPT'}),fixtureTool('shopping','search_products',{query:'ChatGPT'}));
  assert.equal((fixtureTool('failure','search_products',{query:'ChatGPT'}) as any).error,'QUERY_FAILED');
  assert.equal((fixtureTool('guest','get_my_orders',{}) as any).publicOrderQuery.requiresAccountLogin,false);
  assert.throws(()=>fixtureTool('shopping','get_my_orders',{userId:'other'}));
  assert.throws(()=>fixtureTool('shopping','refund_order',{}));
  assert.match(JSON.stringify(fixtureTool('injection','search_knowledge',{query:'故障'})),/不可信引文/);
});
for(const wire of ['responses','chat_completions'] as const) test(`prompt comparison ${wire}: only system prompts differ, context/tools/limits and fixture evidence match`,async()=>{
  const all=[];
  for(const version of ['baseline','current'] as const){
    const h=harness(wire);const result=await runEvalSide({...h.input,mode:'prompt',version,question:'现在推荐哪个？',scenario:'memory',history:fixtureHistory('memory')});
    assert.equal(result.status,'COMPLETED');assert.equal(result.modelCalls,2);assert.equal(result.toolCalls,1);assert.equal(result.toolExecutions,1);assert.equal(result.inputTokens,40);assert.equal(result.outputTokens,20);assert(result.costCny!>0);
    assert.equal(h.reservations.length,2);assert.equal(h.settled.length,2);
    assert.equal(wire==='responses'?h.bodies[1].instructions:h.bodies[1].messages[0].content,version==='baseline'?oldAnswer:newAnswer);
    all.push(h.bodies.map(body=>wire==='responses'?{...body,instructions:'ignored'}:{...body,messages:body.messages.map((m:any)=>m.role==='system'?{...m,content:'ignored'}:m)}));
  }
  assert.deepEqual(all[0],all[1]);
});
for(const wire of ['responses','chat_completions'] as const) test(`full comparison ${wire}: baseline retains original four-turn input and old output caps`,async()=>{
  for(const version of ['baseline','current'] as const){
    const h=harness(wire);await runEvalSide({...h.input,mode:'full',version,question:'预算是多少？',scenario:'memory',history:fixtureHistory('memory')});
    const planning=JSON.parse(wire==='responses'?h.bodies[0].input[0].content:h.bodies[0].messages[1].content);
    assert.equal(planning.history.length,version==='baseline'?8:16);
    assert.equal(h.bodies[0].max_output_tokens||h.bodies[0].max_tokens,version==='baseline'?256:512);
    assert.equal(h.bodies[1].max_output_tokens||h.bodies[1].max_tokens,version==='baseline'?1000:1600);
  }
});
test('prompt mode shares the rated answer, full mode preserves separate transcripts',()=>{
  const session={scenario:'shopping',mode:'prompt',turns:[{id:'one',question:'问题',vote:'B',results:{A:{answer:'甲的回答',status:'COMPLETED'},B:{answer:'乙的回答',status:'COMPLETED'}}}]} as EvalSession;
  assert.deepEqual(historyForSide(session,'A'),historyForSide(session,'B'));
  assert.equal(historyForSide(session,'A')[0].answerText,'乙的回答');
  session.mode='full';assert.equal(historyForSide(session,'A')[0].answerText,'甲的回答');
  const history=Array.from({length:15},(_,i)=>({id:`turn-${i}`,userText:`问题${i}`,answerText:`回答${i}`}));
  assert(evalMemory(history,false).summary.includes('问题2'));
});
test('denial, missing usage and cancellation are visible without fabricated zero costs or retries',async()=>{
  const h=harness('responses');
  const denied=await runEvalSide({...h.input,mode:'full',version:'current',question:'今天天气',history:[],scenario:'shopping'});assert.equal(denied.modelCalls,0);
  const missing=await runEvalSide({...h.input,mode:'full',version:'current',question:'介绍商品',history:[],scenario:'shopping',fetcher:async()=>new Response(JSON.stringify(h.bodies.length?{output_text:'介绍'}:{output_text:JSON.stringify({decision:'deny'})}))});
  assert.equal(missing.costCny,null);assert.equal(missing.reservedCny,0.01);assert.equal(missing.modelCalls,1);
  const c=new AbortController();c.abort();
  const cancelled=await runEvalSide({...h.input,mode:'full',version:'current',question:'介绍商品',history:[],scenario:'shopping',signal:c.signal});assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.modelCalls,0);
});
test('an exhausted evaluation reservation prevents all upstream calls',async()=>{
  const h=harness('responses');
  const result=await runEvalSide({...h.input,mode:'full',version:'current',question:'介绍一下套餐',history:[],scenario:'shopping',reserve:async()=>false});
  assert.equal(result.status,'BUDGET');assert.equal(h.bodies.length,0);assert.equal(result.modelCalls,0);
});

for (const version of ['baseline','current'] as const) test(`evaluation ${version}: connection failure is explained instead of scope rejection`, async () => {
  const h=harness('responses');
  const result=await runEvalSide({...h.input,mode:'full',version,question:'预算100元，主要写代码，推荐哪个套餐？',history:[],scenario:'shopping',fetcher:async()=>{throw new TypeError('fetch failed');}});
  assert.equal(result.status,'SCOPE_UNAVAILABLE');assert.equal(result.calls[0].errorCode,'NETWORK');assert.equal(result.toolExecutions,0);
  assert.match(result.answer,/无法连接模型网关/);assert.doesNotMatch(result.answer,/暂时无法确认问题是否属于/);
  assert.equal(evaluationFailure({...result,answer:'old generic message'} as typeof result)?.label,'模型连接失败');
});
test('evaluation diagnostics distinguish infrastructure, invalid plan and real scope denial',()=>{
  for(const [code,label] of [['UPSTREAM_401','模型网关请求失败'],['TIMEOUT','模型请求超时'],['INVALID_PLAN','规划格式无效'],['INCOMPLETE','模型输出未完成']]) {
    const result={status:'SCOPE_UNAVAILABLE',calls:[{phase:'scope',success:false,errorCode:code}]} as any;
    assert.equal(evaluationFailure(result)?.label,label);
  }
  assert.equal(evaluationFailure({status:'OUT_OF_SCOPE',calls:[]}),null);
  assert.equal(evaluationFailure({status:'COMPLETED',calls:[]}),null);
});

test('evaluation uses corrected identity contracts, renders public order links and preserves raw output',async()=>{
  for (const scenario of ['guest','shopping','member_orders']) {
    const h=harness('responses');let n=0;
    const result=await runEvalSide({...h.input,mode:'full',version:'current',question:'订单去哪查？',history:[],scenario,fetcher:async()=>new Response(JSON.stringify({output_text:++n===1?JSON.stringify({decision:'allow',queries:[{name:'get_navigation',arguments:{page:'my_orders'}}]}):'请点击**查询订单**。',usage}))});
    assert.equal(result.answer,'请点击查询订单。');assert.equal(result.rawAnswer,'请点击**查询订单**。');
    assert.deepEqual(result.ui?.links.map(l=>l.href),scenario==='member_orders'?['/order','/orders']:['/order']);
  }
});
test('evaluation synthetic details never link to production products and failure fixture stays unchanged',async()=>{
  const h=harness('responses');const result=await runEvalSide({...h.input,mode:'full',version:'current',question:'推荐套餐',history:[],scenario:'shopping',fetcher:async(_url,options)=>{
    const body=JSON.parse(String(options?.body));return new Response(JSON.stringify({output_text:body.instructions.includes('查询参数定义')?JSON.stringify({decision:'allow',queries:[{name:'search_products',arguments:{query:''}}]}):'推荐 **Cursor Pro 测试月卡**，159元。',usage}));
  }});
  assert.equal(result.productPreviews?.[0].name,'Cursor Pro 测试月卡');assert.equal(result.productPreviews?.[0].stock,5);assert.equal(result.ui?.links.length,0);
  const zero=fixtureTool('alternatives','search_products',{query:''}) as any;
  assert.equal(zero.relatedProducts.find((p:any)=>p.name.startsWith('ChatGPT')).stock,0);
  assert.equal(zero.relatedProducts.find((p:any)=>p.name.startsWith('Cursor')).stock,5);
  assert.equal((fixtureTool('partial_failure','search_products',{query:'ChatGPT'}) as any).error,'QUERY_FAILED');
  assert((fixtureTool('partial_failure','search_products',{query:'Cursor'}) as any).exactMatches.some((p:any)=>p.stock>0));
  assert.deepEqual(fixtureTool('failure','search_products',{query:''}),{error:'QUERY_FAILED',message:'测试资料中的商品查询暂不可用，不代表无货。'});
});

test('evaluation partial mode shares the production filter and presents buttons plus scope notice',async()=>{
  const h=harness('responses');let n=0;
  const result=await runEvalSide({...h.input,mode:'full',version:'current',question:'订单在哪里查询？另外帮我写Python爬虫',history:[],scenario:'guest',fetcher:async(_url,options)=>{
    const body=JSON.parse(String(options?.body));if(n>0)assert(!JSON.stringify(body.input).includes('Python'));
    return new Response(JSON.stringify({output_text:++n===1?JSON.stringify({decision:'partial',shopQuestion:'订单在哪里查询？',queries:[{name:'get_navigation',arguments:{page:'order_query'}}]}):'点击**查询订单**，无需登录。',usage}));
  }});
  assert.equal(result.status,'COMPLETED');assert.match(result.answer,/其余请求不在客服服务范围/);assert.doesNotMatch(result.answer,/\*\*/);assert.deepEqual(result.ui?.links.map(l=>l.href),['/order']);
});
