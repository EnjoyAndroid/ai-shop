import test from "node:test";
import assert from "node:assert/strict";
import { generateSupportAnswer, type SupportCallRecord } from "../src/lib/support/llm";
import { executeSupportTool, supportTools } from "../src/lib/support/tools";
import { recentContext, nextContextSummary } from "../src/lib/support/context";
import { isOutOfScopeSupportQuestion } from "../src/lib/support/policy";
import type { SupportConfig } from "../src/lib/support/config";
const config: SupportConfig = { provider: "test", baseUrl: "https://example.invalid/v1", model: "test-model", wireApi: "responses", apiKey: "synthetic-key", dailyBudgetCny: 10, usdCnyRate: 7, inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, cacheWriteUsdPerMillion: 0.1, outputUsdPerMillion: 0.5 };
function harness(sequence: any[], wireApi: SupportConfig['wireApi'] = 'responses', scope: unknown = {decision:'allow'}) {
  sequence = [{...(wireApi === 'responses' ? {output_text:JSON.stringify(scope)} : {choices:[{message:{role:'assistant',content:JSON.stringify(scope)}}]}), usage:{input_tokens:9,output_tokens:4,total_tokens:13}}, ...sequence];
  const bodies: any[] = [], records: SupportCallRecord[] = [], executed: any[] = [];
  return { bodies, records, executed, input: {
    question: '那另一个呢？', summary: '用户比较 Claude 与 GPT 套餐。', history: [{role:'user' as const,content:'Claude多少钱'}, {role:'assistant' as const,content:'请问具体哪个套餐？'}], config: {...config,wireApi},
    beforeCall: async () => true,
    recordCall: async (record: SupportCallRecord) => {records.push(record);},
    execute: async (name: string,args: unknown) => {executed.push({name,args});return {exactMatches:[],relatedProducts:[{name:'Claude Pro',priceCny:129,stock:0}]};},
    fetcher: (async (_url, options) => {bodies.push(JSON.parse(String(options?.body))); const next=sequence.shift();return new Response(JSON.stringify(next?.data ?? next),{status:next?.statusCode??200});}) as typeof fetch,
  }};
}
const usage={input_tokens:9,output_tokens:4,total_tokens:13};
for (const wire of ['responses','chat_completions'] as const) test(`agent ${wire}: preserves context, multiple tools and records every model request`,async()=>{
  const toolCalls=[{id:'one',type:'function',function:{name:'search_products',arguments:'{"query":"Claude 5x"}'}},{id:'two',type:'function',function:{name:'search_knowledge',arguments:'{"query":"购买流程"}'}}];
  const first=wire==='responses'?{output:[{type:'reasoning',id:'r',summary:[]},...toolCalls.map(c=>({type:'function_call',call_id:c.id,name:c.function.name,arguments:c.function.arguments}))],usage}:{choices:[{message:{role:'assistant',content:null,tool_calls:toolCalls}}],usage};
  const second=wire==='responses'?{output:[{type:'message',content:[{type:'output_text',text:'没有该型号，相关套餐当前缺货。'}]}],usage}:{choices:[{message:{role:'assistant',content:'没有该型号，相关套餐当前缺货。'},finish_reason:'stop'}],usage};
  const h=harness([first,second],wire);
  assert.match(await generateSupportAnswer(h.input),/缺货/);
  assert.equal(h.executed.length,2); assert.equal(h.records.length,3); assert(h.records.every(r=>r.success&&r.usage.totalTokens===13));
  const initial=JSON.stringify(h.bodies[0]); assert(initial.includes('那另一个呢'));assert(initial.includes('用户比较'));assert(!initial.includes('priceCny'));
  const secondBody=h.bodies[2];assert.equal(secondBody.store,false);
  if(wire==='responses'){assert(secondBody.input.some((i:any)=>i.type==='reasoning'));assert.equal(secondBody.input.filter((i:any)=>i.type==='function_call_output').length,2);}
  else {assert.equal(secondBody.messages.filter((m:any)=>m.role==='tool').length,2);assert.equal(secondBody.tools[0].function.name,'search_products');}
});

test('invalid or unauthorized tools return a query error, never execute arbitrary actions',async()=>{
  const h=harness([{output:[{type:'function_call',call_id:'a',name:'refund_order',arguments:'{}'},{type:'function_call',call_id:'b',name:'search_products',arguments:'{broken'}],usage},{output_text:'需要进一步确认。',usage}]);
  await generateSupportAnswer(h.input);assert.equal(h.executed.length,0);assert.match(JSON.stringify(h.bodies[2]),/QUERY_FAILED/);
  await assert.rejects(executeSupportTool('get_my_orders',{userId:'someone-else'},'self'));
  await assert.rejects(executeSupportTool('refund_order',{}));
  const guest=await executeSupportTool('get_my_orders',{}) as any;assert.equal(guest.requiresLogin,true);
});

test('tool loop and budget limits stop requests; upstream 503 is recorded without invented facts',async()=>{
  const h=harness(Array.from({length:4},(_,i)=>({output:[{type:'function_call',call_id:`c${i}`,name:'get_contacts',arguments:'{}'}],usage})));
  await assert.rejects(generateSupportAnswer(h.input), /查询次数/);assert.equal(h.executed.length,3);assert.equal(h.bodies[4].tool_choice,'none');
  const blocked=harness([]);await assert.rejects(generateSupportAnswer({...blocked.input,beforeCall:async()=>false}),/服务范围/);assert.equal(blocked.bodies.length,0);
  const error=harness([{statusCode:503,data:{error:{type:'api_error'}}}]);await assert.rejects(generateSupportAnswer(error.input),/网关/);assert.equal(error.records[1].errorCode,'UPSTREAM_503');assert.equal(error.records[1].success,false);assert.equal(error.records[1].usage.totalTokens,null);
});

test('tool query failures are distinguished from empty matches and can be clarified',async()=>{
  const h=harness([{output:[{type:'function_call',call_id:'a',name:'search_products',arguments:'{"query":"x"}'}],usage},{output_text:'查询暂时失败，请稍后重试。',usage}]);
  assert.match(await generateSupportAnswer({...h.input,execute:async()=>{throw new Error('db unavailable');}}),/失败/);
  assert.match(JSON.stringify(h.bodies[2]),/QUERY_FAILED/);
});

test('context uses latest twelve turns and compacts older content without duplicating recent turns',()=>{
  const turns=Array.from({length:40},(_,i)=>({userText:`问题${40-i}`,answerText:`回答${40-i}`}));
  const recent=recentContext(turns);assert.equal(recent[0].content,'问题29');assert.equal(recent.at(-1)?.content,'回答40');assert(!recent.some(m=>m.content==='问题1'));
  const summary=nextContextSummary('最初预算100元',turns);assert.match(summary,/预算100元/);assert.match(summary,/问题29/);assert(!summary.includes('问题40'));
  let bounded='';for(let i=0;i<100;i++)bounded=nextContextSummary(bounded,turns.map(t=>({...t,userText:'长问题'.repeat(300)})));assert(bounded.length<=6000);
});

test('obvious unrelated requests cannot be whitelisted by adding shop words', () => {
  for (const text of ['你能帮我写 Python 代码吗？','AIShop今天天气怎么样？','Claude Pro多少钱，顺便告诉我天气','那今天天气呢','帮商城写商品购买接口','write Python code','给我写一首诗']) assert.equal(isOutOfScopeSupportQuestion(text),true,text);
  for (const text of ['帮我查一下商品库存','Cursor这个商品适合写代码吗','Gemini Advanced多少钱','我的兑换码无法使用']) assert.equal(isOutOfScopeSupportQuestion(text),false,text);
});

for (const wire of ['responses','chat_completions'] as const) test(`scope ${wire}: deny, ambiguity and malformed classifications never reach answering model or tools`,async()=>{
  for(const [decision,code] of [[{decision:'deny'},'OUT_OF_SCOPE'],[{decision:'clarify'},'SCOPE_CLARIFY'],[{decision:'allow',answer:'unauthorized'},'SCOPE_UNAVAILABLE'],[{decision:'ALLOW'},'SCOPE_UNAVAILABLE'],['allow','SCOPE_UNAVAILABLE']]) {
    const h=harness([],wire,decision);
    await assert.rejects(generateSupportAnswer(h.input),(e:any)=>e.code===code);
    assert.equal(h.executed.length,0);assert.equal(h.bodies.length,1);assert.equal(h.records[0].phase,'scope');
    assert.equal(h.bodies[0].tools,undefined);
  }
});

test('scope gateway failure and non-JSON output fail closed without fallback generation',async()=>{
  for(const data of [{error:{}},{output_text:'当然可以帮你写代码'},{output:[{type:'function_call',call_id:'bad',name:'get_contacts',arguments:'{}'}]}]) {
    const h=harness([]);
    await assert.rejects(generateSupportAnswer({...h.input,fetcher:async()=>new Response(JSON.stringify(data),{status:data.error?503:200})}),(e:any)=>e.code==='SCOPE_UNAVAILABLE');
    assert.equal(h.executed.length,0);
  }
});
