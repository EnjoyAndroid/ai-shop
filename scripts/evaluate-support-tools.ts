import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs, parseEnv } from 'node:util';
import { supportConfigFromSettings } from '../src/lib/support/config';
import { fallbackAnswer } from '../src/lib/support/service';
import { fixtureTool, fixtureProducts, fixtureArticle, fixtureHistory, fixtureAuthenticated, fixtureVersion } from './support-eval/fixtures';
import { occupiedCny, reserveEvaluation, settleEvaluation, type EvalLedger } from './support-eval/budget';
import type { SupportCallRecord, SupportCallStart } from '../src/lib/support/llm';

interface Task { id:string; scenario:string; questions:string[]; expected:string[]; mode?:string; }
const atomic=(path:string,value:unknown)=>{mkdirSync(dirname(path),{recursive:true});const temp=`${path}.tmp`;writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(temp,path);};
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function artifactPath(value:string){const path=resolve(value);if(!path.startsWith(resolve('.deploy')+'/'))throw new Error('Artifacts must be under .deploy');return path;}
function fingerprint(){
  const files=['package-lock.json',...readdirSync('src/lib/support').filter(f=>f.endsWith('.ts')).map(f=>`src/lib/support/${f}`),
    'scripts/evaluate-support-tools.ts',...readdirSync('scripts/support-eval').map(f=>`scripts/support-eval/${f}`)];
  return Object.fromEntries(files.sort().map(file=>[file,digest(readFileSync(file))]));
}
async function main(){
  const {values}=parseArgs({options:{live:{type:'boolean',default:false},output:{type:'string',default:'.deploy/support-tools-evaluation'},ledger:{type:'string'},
    'baseline-ref':{type:'string'},suite:{type:'string',default:'all'},case:{type:'string'},'budget-cny':{type:'string',default:'1'},'retry-failed':{type:'boolean',default:false}}});
  const historical=JSON.parse(readFileSync('scripts/support-eval/historical.json','utf8')) as Task[];
  const heldout=JSON.parse(readFileSync('scripts/support-eval/heldout.json','utf8')) as Task[];
  // Repeated critical cases are frozen before any live outputs are inspected.
  const repeated=[...heldout,...[2,3].flatMap(repeat=>heldout.filter(t=>['H01','H04','H09'].includes(t.id)).map(t=>({...t,id:`${t.id}-repeat${repeat}`})))];
  if(!['all','historical','heldout'].includes(values.suite!))throw new Error('Invalid suite');
  const tasks=(values.suite==='historical'?historical:values.suite==='heldout'?repeated:[...historical,...repeated]).filter(t=>!values.case||values.case.split(',').includes(t.id));
  if(!tasks.length)throw new Error('No matching evaluation tasks');
  if(!values.live){console.log(JSON.stringify({mode:'dry-run',sessions:tasks.length,questionPairs:tasks.reduce((n,t)=>n+t.questions.length,0),fixtureVersion,networkCalls:0}));return;}
  const ceiling=Number(values['budget-cny']);if(!Number.isFinite(ceiling)||ceiling<=0||ceiling>100)throw new Error('Invalid explicit budget');
  if(!values['baseline-ref']||!/^[a-f0-9]{7,40}$/.test(values['baseline-ref']))throw new Error('Live comparison requires a fixed baseline commit');
  const output=artifactPath(values.output!), ledgerPath=artifactPath(values.ledger||join(output,'ledger.json'));
  mkdirSync(output,{recursive:true});mkdirSync(dirname(ledgerPath),{recursive:true});
  const lock=openSync(`${ledgerPath}.lock`,'wx',0o600);
  try{
    const ledger:EvalLedger=existsSync(ledgerPath)?JSON.parse(readFileSync(ledgerPath,'utf8')):{ceilingCny:ceiling,calls:[]};
    if(ledger.ceilingCny!==ceiling)throw new Error('Existing ledger ceiling cannot be changed');
    // Only the manual development entrypoint supplies the model credential.
    // Never load production config, database URLs, notification or payment keys.
    const dev=parseEnv(readFileSync('.env','utf8'));
    for(const key of Object.keys(process.env))if(key.startsWith('SUPPORT_LLM_')||key==='SUPPORT_USD_CNY_RATE')delete process.env[key];
    for(const [key,value]of Object.entries(dev))if(key.startsWith('SUPPORT_LLM_')||key==='SUPPORT_USD_CNY_RATE')process.env[key]=value;
    const config=supportConfigFromSettings({});
    if(!config.apiKey)throw new Error('Development model key is not configured');
    const endpoint=new URL(config.baseUrl);if(endpoint.hostname==='host.docker.internal'&&endpoint.protocol==='http:'){endpoint.hostname='127.0.0.1';config.baseUrl=endpoint.toString().replace(/\/$/,'');}
    if(config.inputUsdPerMillion<=0||config.outputUsdPerMillion<=0||config.usdCnyRate<=0)throw new Error('Positive model price estimates are required');
    const base=execFileSync('git',['rev-parse',values['baseline-ref']],{encoding:'utf8'}).trim();
    const hashes=fingerprint();
    const manifest={base,hashes,fixtureVersion,model:config.model,wireApi:config.wireApi,endpointHash:digest(config.baseUrl),
      rates:{input:config.inputUsdPerMillion,cached:config.cachedInputUsdPerMillion,write:config.cacheWriteUsdPerMillion,output:config.outputUsdPerMillion,usdCny:config.usdCnyRate},ledger:relative(process.cwd(),ledgerPath),ceilingCny:ceiling};
    const manifestFile=join(output,'manifest.json');
    if(existsSync(manifestFile)&&JSON.stringify(JSON.parse(readFileSync(manifestFile,'utf8')))!==JSON.stringify(manifest))throw new Error('Frozen evaluation inputs changed; use a new output directory and the same ledger');
    atomic(manifestFile,manifest);atomic(ledgerPath,ledger);
    const baselineDir=join(output,'baseline');
    for(const file of execFileSync('git',['ls-tree','-r','--name-only',base,'src/lib/support'],{encoding:'utf8'}).trim().split('\n')){
      const path=join(baselineDir,file);mkdirSync(dirname(path),{recursive:true});
      if(!existsSync(path))writeFileSync(path,execFileSync('git',['show',`${base}:${file}`]));
    }
    const load=async(root:string)=>({llm:await import(pathToFileURL(join(root,'src/lib/support/llm.ts')).href),
      policy:await import(pathToFileURL(join(root,'src/lib/support/policy.ts')).href),context:await import(pathToFileURL(join(root,'src/lib/support/context.ts')).href),
      tools:await import(pathToFileURL(join(root,'src/lib/support/tools.ts')).href),ui:await import(pathToFileURL(join(root,'src/lib/support/ui.ts')).href),faq:await import(pathToFileURL(join(root,'src/lib/support/faq.ts')).href)});
    const implementations={baseline:await load(baselineDir),candidate:await load(process.cwd())};
    for(const task of tasks){
      for(const side of ['baseline','candidate'] as const){
        const api=implementations[side],history=fixtureHistory(task.scenario);let summary='',memory:any,covered=0;
        for(let index=0;index<task.questions.length;index++){
          const file=join(output,`${task.id}.${index}.${side}.json`);
          let result:any=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):undefined;
          if(result&&result.error&&values['retry-failed']){renameSync(file,join(output,`${task.id}.${index}.${side}.attempt-${Date.now()}.json`));result=undefined;}
          if(!result){
            if(JSON.stringify(hashes)!==JSON.stringify(fingerprint()))throw new Error('Source changed during evaluation');
            const question=task.questions[index],calls:SupportCallRecord[]=[],evidence:any[]=[],toolCalls:any[]=[],requests:any[]=[];
            const started=Date.now();let answer='',status='COMPLETED',error:string|null=null,nextMemory:any;
            try{
              const greeting=api.policy.supportGreetingAnswer(question),faq=api.faq.trustedSupportFaq(question);
              if(api.policy.isOutOfScopeSupportQuestion(question)){answer=api.policy.SUPPORT_SCOPE_REFUSAL;status='OUT_OF_SCOPE';}
              else if(greeting){answer=greeting;status='GREETING';}
              else if(faq){
                const products=fixtureProducts(task.scenario).map(({price,...p})=>({...p,priceCny:price/100,description:p.description||''}));
                answer=fallbackAnswer(question,fixtureArticle(task.scenario).content,{siteName:'Test',products,orders:[],paymentMethods:['账户余额','支付宝'],contacts:{telegramUrl:'',wechatSupportText:'测试客服',wechatSupportQrUrl:''},announcements:[]});status='FAQ';
              }else answer=await api.llm.generateSupportAnswer({question,
                history:api.context.fullContext ? api.context.fullContext(history.slice(memory&&!memory.disabledReason?covered:0)) : api.context.recentContext([...history].reverse()),
                fallbackHistory:api.context.recentContext([...history].reverse()),summary,config,memory,memoryBinding:`${task.id}:${side}`,
                onMemory:(value:any)=>{nextMemory=value;},
                execute:async(name:string,args:unknown)=>{
                  const parsed=api.tools.validateSupportTool(name,args),raw=fixtureTool(task.scenario,name,parsed,side==='baseline');
                  evidence.push({tool:name,arguments:parsed,result:raw,modelResult:side==='candidate'?null:undefined});
                  return api.ui.modelToolResult(name,raw);
                },
                onToolCall:(record:any)=>{
                  toolCalls.push(record);const entry=evidence.find(e=>e.tool===record.tool&&(e.modelResult===null||record.cacheHit)&&JSON.stringify(e.arguments)===JSON.stringify(record.arguments));
                  if(entry)entry.modelResult=record.result;
                },
                beforeCall:async(start:SupportCallStart)=>{
                  const reservation=reserveEvaluation(ledger,start,config,randomUUID());atomic(ledgerPath,ledger);
                  if(reservation)requests.push({phase:start.phase,sequence:start.sequence,body:start.body});
                  return reservation;
                },
                recordCall:async(call:SupportCallRecord)=>{calls.push(call);settleEvaluation(ledger,call,config);atomic(ledgerPath,ledger);},
              });
            }catch(e:any){
              const code=typeof e.code==='string'?e.code:'EVALUATION_ERROR';
              if(code==='OUT_OF_SCOPE'){answer=api.policy.SUPPORT_SCOPE_REFUSAL;status=code;}
              else if(code==='SCOPE_CLARIFY'){answer=api.policy.SUPPORT_SCOPE_CLARIFICATION;status=code;}
              else{status='ERROR';error=code;}
            }
            result={id:task.id,index,side,scenario:task.scenario,question,expected:task.expected[index],answer,status,error,
              latencyMs:Date.now()-started,ui:api.ui.buildSupportUi(evidence,answer,fixtureAuthenticated(task.scenario)?'synthetic-member':undefined),calls,toolCalls,evidence,requests,memory:nextMemory};
            atomic(file,result);
            console.log(JSON.stringify({id:task.id,index,side,status,error,calls:calls.length,tools:evidence.length,occupiedCny:occupiedCny(ledger).toString()}));
            await new Promise(resolve=>setTimeout(resolve,2000));
          }
          if(result.error&&(/^(BUDGET|SCOPE_UNAVAILABLE|TIMEOUT|NETWORK|UPSTREAM_)/.test(result.error)||result.calls.some((c:SupportCallRecord)=>/^(TIMEOUT|NETWORK|UPSTREAM_)/.test(c.errorCode||''))))throw new Error(`Stopped on ${result.error}; failure and cost retained`);
          if(['COMPLETED','FAQ','GREETING'].includes(result.status)){
            summary=api.context.nextContextSummary(summary,[...history].reverse());
            history.push({id:`${task.id}-${index}`,userText:result.question,answerText:result.answer});
            if(result.memory){memory=result.memory;covered=history.length;}
          }else if(index+1<task.questions.length)throw new Error('Multi-turn chain did not complete; do not invent missing history');
        }
      }
    }
    atomic(join(output,'completion.json'),{status:'raw-run-complete',sourceUnchanged:JSON.stringify(hashes)===JSON.stringify(fingerprint()),occupiedCny:occupiedCny(ledger).toString(),qualityReview:'pending; completion is not quality pass'});
    console.log('Raw evaluation complete; review answers against independent expectations.');
  }finally{closeSync(lock);unlinkSync(`${ledgerPath}.lock`);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Evaluation failed');process.exitCode=1;});
