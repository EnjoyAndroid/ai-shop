import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSupportAnswer, parseSupportPlan, type SupportCallRecord } from '../src/lib/support/llm';
import { buildSupportUi } from '../src/lib/support/ui';
import type { SupportConfig } from '../src/lib/support/config';
import type { NativeMemory } from '../src/lib/support/native-context';

const config: SupportConfig = {provider:'test',baseUrl:'https://example.invalid/v1',model:'gpt-6-luna',wireApi:'responses',apiKey:'synthetic',dailyBudgetCny:10,usdCnyRate:7.2,inputUsdPerMillion:0.1,cachedInputUsdPerMillion:0.01,cacheWriteUsdPerMillion:0.125,outputUsdPerMillion:0.5};
const usage={input_tokens:100,output_tokens:20,total_tokens:120};
const history=[{role:'user' as const,content:'预算提高到200元，用于写代码，只考虑月付。'},{role:'assistant' as const,content:'已记录最新条件。'}];
const plan=(answerMode:string,queries:unknown[]=[])=>({decision:'allow',answerMode,queries});
const output=(text:string,wire:string)=>wire==='responses'?{output:[{type:'message',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}],usage}:{choices:[{message:{role:'assistant',content:text}}],usage};
const tools=(wire:string)=>wire==='responses'?{output:[{type:'function_call',call_id:'unexpected-query',name:'search_products',arguments:'{"query":""}'}],usage}:{choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'unexpected-query',type:'function',function:{name:'search_products',arguments:'{"query":""}'}}]}}],usage};
function setup(wire:SupportConfig['wireApi'],native:boolean,responses:any[]){
 const bodies:any[]=[],executed:any[]=[],calls:SupportCallRecord[]=[],memories:NativeMemory[]=[];
 const input={config:{...config,wireApi:wire,contextMode:native?'native' as const:'local' as const},question:'我后来改成多少预算了，考虑什么用途和付费周期？',history,summary:'',memoryBinding:'answer-mode-test',
 beforeCall:async()=>true,recordCall:async(c:SupportCallRecord)=>{calls.push(c);},execute:async(name:string,args:unknown)=>{executed.push({name,args});return {name:'测试商品',stock:3,priceCny:99};},
 onMemory:(m:NativeMemory)=>{memories.push(m);},fetcher:(async(_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify(responses.shift()));}) as typeof fetch};
 return{input,bodies,executed,calls,memories};
}

test('answer mode is explicit and context-only plans cannot contain any planned query',()=>{
 assert.throws(()=>parseSupportPlan('{"decision":"allow","queries":[]}'));
 assert.throws(()=>parseSupportPlan(JSON.stringify(plan('guess'))));
 assert.throws(()=>parseSupportPlan(JSON.stringify(plan('context_only',[{name:'get_contacts',arguments:{}}]))));
 assert.throws(()=>parseSupportPlan(JSON.stringify({...plan('context_only'),extra:true})));
 assert.deepEqual(parseSupportPlan(JSON.stringify(plan('tools_allowed'))),plan('tools_allowed'));
 assert.equal(parseSupportPlan(JSON.stringify(plan('context_only'))).answerMode,'context_only');
 assert.throws(()=>parseSupportPlan('{"decision":"deny","answerMode":"context_only"}'));
 assert.equal(parseSupportPlan('{"decision":"clarify"}').decision,'clarify');
});

for(const [wire,native]of [['responses',true],['responses',false],['chat_completions',false]] as const){
 test(`context-only recall has no tool activity or product UI (${wire}, native=${native})`,async()=>{
  const h=setup(wire,native,[output(JSON.stringify(plan('context_only')),wire),output('200元、写代码、月付。',wire)]);
  const answer=await generateSupportAnswer(h.input);
  assert.match(answer,/200元/);assert.equal(h.bodies.length,2);assert.equal(h.bodies[1].tool_choice,'none');assert.equal(h.executed.length,0);
  assert.deepEqual(buildSupportUi([],answer).links,[]);
  if(native)assert(h.memories.at(-1)?.stages.answer);
 });
 test(`context-only rejects provider tool calls before execute and native save (${wire}, native=${native})`,async()=>{
  const h=setup(wire,native,[output(JSON.stringify(plan('context_only')),wire),tools(wire)]);
  await assert.rejects(generateSupportAnswer(h.input),(e:any)=>e.code==='TOOLS_DISABLED');
  assert.equal(h.executed.length,0);assert.equal(h.bodies.length,2);assert.equal(h.calls.at(-1)?.success,false);assert.equal(h.calls.at(-1)?.errorCode,'TOOLS_DISABLED');assert.equal(h.memories.length,0);
 });
 test(`empty initial plan still permits needed follow-up in tools mode (${wire}, native=${native})`,async()=>{
  const h=setup(wire,native,[output(JSON.stringify(plan('tools_allowed')),wire),tools(wire),output('99元，有货。',wire)]);
  const answer=await generateSupportAnswer({...h.input,question:'按之前预算推荐现在有货的套餐。'});
  assert.match(answer,/99元/);assert.equal(h.bodies[1].tool_choice,'auto');assert.equal(h.executed.length,1);assert.equal(h.calls.length,3);
 });
}

test('native conversation changes from context-only recall to live recommendation without disabling future tools',async()=>{
 const first=setup('responses',true,[output(JSON.stringify(plan('context_only')),'responses'),output('200元、写代码、月付。','responses')]);
 await generateSupportAnswer(first.input);const memory=first.memories.at(-1)!;
 const second=setup('responses',true,[output(JSON.stringify(plan('tools_allowed',[{name:'search_products',arguments:{query:''}}])),'responses'),output('99元有货。','responses')]);
 await generateSupportAnswer({...second.input,history:[],memory,question:'那按这些条件推荐现在有货的商品。'});
 assert.equal(second.bodies[1].tool_choice,'auto');assert.equal(second.executed.length,1);
 assert.deepEqual(second.bodies[1].input.slice(0,memory.stages.answer!.items.length),memory.stages.answer!.items);
});

test('mixed recall uses context-only after validated extraction and still emits scope notice',async()=>{
 const question='我后来预算多少？顺便告诉我天气';
 const h=setup('responses',true,[output(JSON.stringify({decision:'partial',answerMode:'context_only',shopQuestion:'我后来预算多少？',queries:[]}),'responses'),output('200元。','responses')]);
 const answer=await generateSupportAnswer({...h.input,question});
 assert.equal(h.bodies[1].tool_choice,'none');assert(!JSON.stringify(h.bodies[1].input).includes('天气'));assert.match(answer,/其余请求/);assert.equal(h.executed.length,0);
});

test('context-only is preserved across native-to-local parameter rejection',async()=>{
 const h=setup('responses',true,[output(JSON.stringify(plan('context_only')),'responses')]);
 const responses=[output(JSON.stringify(plan('context_only')),'responses'),{error:{message:'unsupported compaction'}},output('200元。','responses')];
 let n=0;
 const answer=await generateSupportAnswer({...h.input,fetcher:(async(_url,init)=>{h.bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify(responses[n]),{status:n++===1?400:200});}) as typeof fetch});
 assert.match(answer,/200元/);assert.equal(h.bodies[1].tool_choice,'none');assert.equal(h.bodies[2].tool_choice,'none');assert.equal(h.executed.length,0);
});
