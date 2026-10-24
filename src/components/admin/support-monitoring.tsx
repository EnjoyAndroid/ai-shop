'use client';
import { useEffect, useRef, useState } from 'react';

type Call = {id:string;phase:string;sequence:number;requestModel:string;responseModel:string|null;inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;cachedTokens:number|null;cacheWriteTokens:number|null;reasoningTokens:number|null;estimatedCost:string|null;usageStatus:string;latencyMs:number|null;success:boolean;errorCode:string|null;accountingState:string};
type Turn = {id:string;conversationId:string;requestId:string;createdAt:string;account:string|null;userId:string|null;identityHash:string|null;clientIp:string|null;clientIpTrusted:boolean;userText:string;answerText:string|null;status:string;latencyMs:number|null;clearedAt:string|null;modelCalls?:Call[]};
type Usage = {page:number;pageSize:number;total:number;hasMore:boolean;from:string;to:string;summary:{calls:number;turns:number;failures:number;usageMissing:number;input:number;cached:number;writes:number;output:number;reasoning:number;totalTokens:number;costUsd:number;unsettledCny:number;avgCallMs:number;avgTurnMs:number;statuses:Record<string,number>};items:Turn[]};
type RiskEvent={id:string;category:string;identityHash:string|null;userId:string|null;clientIp:string|null;createdAt:string;count:number;details:{reason?:string;adminId?:string}|null};
type Risk={page:number;total:number;hasMore:boolean;events:RiskEvent[];blocks:Array<{id:string;label:string;kind:string;reason:string;expiresAt:string;createdBy:string}>};
type Target={source:'turn'|'event';id:string;identityHash:string|null;userId:string|null;clientIp:string|null};
const control='rounded-lg border px-3 py-2 text-sm';
const button='rounded-lg border px-3 py-2 text-sm disabled:opacity-40';
const stamp=(date:string)=>new Date(date).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
const labels:Record<string,string>={FAQ:'常见问题',COMPLETED:'已回答',GREETING:'寒暄',OUT_OF_SCOPE:'超出服务范围',SCOPE_CLARIFY:'需要澄清',SCOPE_UNAVAILABLE:'规划不可用',PROCESSING:'处理中',CANCELLED:'已取消',FAILED:'未完成',DAILY_LIMIT:'日额度已用完',RATE_LIMIT:'频率限制',COOLDOWN:'短暂冷却',DUPLICATE_SPAM:'重复刷屏',CONCURRENT:'并发已满',CIRCUIT:'模型暂时熔断',BLOCKED:'人工封禁',ADMIN_BLOCK:'管理员封禁',ADMIN_UNBLOCK:'管理员解封',ADMIN_BUDGET:'预算调整',COMPLETE:'完整',MISSING:'缺失',PENDING:'待返回'};
const recentDates=()=>{const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return {to:today,from:new Date(new Date(`${today}T00:00:00+08:00`).getTime()-6*86400000+8*3600000).toISOString().slice(0,10)};};
const state=(value:string)=>labels[value]||labels[value.replace(/^RISK_/,'')]||value;
function CallTable({calls}:{calls:Call[]}) {return <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-xs text-left"><thead><tr className="border-b text-gray-500">{['阶段 / 模型','输入 / 缓存读 / 缓存写','输出 / 推理','耗时','费用 USD / usage','结果'].map(v=><th key={v} className="p-2">{v}</th>)}</tr></thead><tbody>{calls.map(c=><tr key={c.id} className="border-b"><td className="p-2">{c.phase==='planner'?'规划':'回答'} #{c.sequence||'历史'}<br/>{c.responseModel||c.requestModel}</td><td className="p-2">{c.inputTokens??'未知'} / {c.cachedTokens??'—'} / {c.cacheWriteTokens??'—'}</td><td className="p-2">{c.outputTokens??'未知'} / {c.reasoningTokens??'—'}</td><td className="p-2">{c.latencyMs??'未记录'} ms</td><td className="p-2">{c.estimatedCost===null?'未知':Number(c.estimatedCost).toFixed(8)}<br/>{state(c.usageStatus)}</td><td className="p-2">{c.success?'成功':'未成功'}<br/>{c.errorCode}</td></tr>)}</tbody></table></div>;}
export function SupportMonitoring({view}:{view:'usage'|'risk'}) {
  const [page,setPage]=useState(1),[filters,setFilters]=useState(()=>({...recentDates(),q:''})),[recent7,setRecent7]=useState(true);
  const [usage,setUsage]=useState<Usage|null>(null),[risk,setRisk]=useState<Risk|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[version,setVersion]=useState(0);
  const [target,setTarget]=useState<Target|null>(null),[kind,setKind]=useState('identity'),[reason,setReason]=useState(''),[saving,setSaving]=useState(false);
  const [composing,setComposing]=useState(false);
  const lastSearch=useRef('');
  const searchInput=useRef<HTMLInputElement>(null);
  const invalidDates=!recent7&&(!filters.from||!filters.to||filters.from>filters.to);
  useEffect(()=>{
    const controller=new AbortController();setError('');
    if(view==='usage'&&(composing||invalidDates)){setBusy(false);return()=>controller.abort();}
    setBusy(true);
    const delay=view==='usage'&&lastSearch.current!==filters.q?280:0;
    const timer=setTimeout(()=>{
      const params=new URLSearchParams({page:String(page),pageSize:'25',...(view==='usage'?{view:'turns',q:filters.q,...(!recent7?{from:filters.from,to:filters.to}:{})}:{})});
      void(async()=>{try{
        const r=await fetch(`/api/admin/support/${view==='usage'?'usage':'risk'}?${params}`,{cache:'no-store',signal:controller.signal});const d=await r.json();
        if(!r.ok)throw new Error(d.error||'加载失败');
        if(controller.signal.aborted)return;
        if(view==='usage'){setUsage(d);lastSearch.current=filters.q;}else setRisk(d);
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'加载失败');}finally{if(!controller.signal.aborted)setBusy(false);}})();
    },delay);
    return()=>{clearTimeout(timer);controller.abort();};
  },[view,page,filters,recent7,composing,invalidDates,version]);
  function changeDate(field:'from'|'to',value:string){setRecent7(false);setPage(1);setFilters(current=>({...current,[field]:value}));}
  function clearSearch(){lastSearch.current='';setComposing(false);setPage(1);setFilters(current=>({...current,q:''}));searchInput.current?.focus();}
  const choose=(value:Target)=>{setTarget(value);setKind(value.userId?'user':value.identityHash?'identity':'ip');setReason('');};
  async function mutate(body:unknown) {setSaving(true);setError('');try{const r=await fetch('/api/admin/support/risk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'操作失败');setTarget(null);setNotice('操作已生效，仅影响智能客服。');setVersion(v=>v+1);}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setSaving(false);}}
  const summary=usage?.summary;
  const cards=summary?[['提问数',summary.turns],['模型调用数',summary.calls],['常见问题',summary.statuses.FAQ||0],['失败调用',summary.failures],['输入 Token',summary.input],['输出 Token',summary.output],['缓存读取 / 写入',`${summary.cached} / ${summary.writes}`],['推理 Token',summary.reasoning],['已知估算 USD',summary.costUsd.toFixed(6)],['usage 缺失/待返回',summary.usageMissing],['待核实/预占（元）',summary.unsettledCny.toFixed(6)],['平均整轮 / 模型耗时',`${summary.avgTurnMs} / ${summary.avgCallMs} ms`]]:[];
  return <div className="space-y-4">
    {view==='usage'&&<div className="flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
      <label className="text-sm">开始日期<input aria-label="开始日期" type="date" value={filters.from} onChange={e=>changeDate('from',e.target.value)} className={`block ${control}`}/></label>
      <label className="text-sm">结束日期<input aria-label="结束日期" type="date" value={filters.to} onChange={e=>changeDate('to',e.target.value)} className={`block ${control}`}/></label>
      <fieldset className="flex items-center gap-4 px-1 py-2 text-sm" aria-label="日期范围">
        <legend className="sr-only">日期范围</legend>
        <label className={`flex cursor-pointer items-center gap-2 ${recent7?'font-medium text-primary':'text-gray-500'}`}><input type="radio" name="support-date-range" checked={recent7} onChange={()=>{setRecent7(true);setPage(1);setFilters(current=>({...current,...recentDates()}));}} className="accent-blue-600"/>最近 7 天</label>
        <label className={`flex cursor-pointer items-center gap-2 ${!recent7?'font-medium text-primary':'text-gray-500'}`}><input type="radio" name="support-date-range" checked={!recent7} onChange={()=>{setRecent7(false);setPage(1);}} className="accent-blue-600"/>自定义</label>
      </fieldset>
      <div className="min-w-48 flex-1">
        <label htmlFor="support-search" className="block text-sm">搜索</label>
        <div className="relative">
          <input id="support-search" ref={searchInput} value={filters.q} onChange={e=>{setPage(1);setFilters(current=>({...current,q:e.target.value}));}} onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)} placeholder="搜索游客ID、账号、IP、请求编号或问答内容" className="block w-full rounded-lg border py-2 pl-3 pr-10 text-sm" maxLength={100}/>
          {filters.q.length>0&&<button type="button" aria-label="清除搜索" title="清除搜索" onClick={clearSearch} className="absolute inset-y-0 right-1 flex w-8 items-center justify-center rounded text-xl leading-none text-gray-400 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"><span aria-hidden="true">×</span></button>}
        </div>
      </div>
    </div>}

    {view==='usage'&&invalidDates&&<p role="status" className="text-sm text-amber-700">请选择完整的日期范围，开始日期不能晚于结束日期。</p>}
    {error&&<p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice&&<p role="status" className="text-sm text-green-700">{notice}</p>}
    {busy&&<p role="status" className="text-sm text-gray-500">正在加载…</p>}
    {usage&&<><p className="text-xs text-gray-500">{usage.from} 至 {usage.to}（北京时间），汇总包含范围内全部记录。问答明细保留90天，用量保留180天；历史未采集的 IP 和耗时显示为未知。</p><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{cards.map(([label,value])=><div key={String(label)} className="rounded-xl bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-semibold break-all">{value}</p></div>)}</div><p className="text-xs text-gray-500">推理 Token 已包含在输出 Token 中。缺失 usage 的费用未知，预占金额不代表已确认消费；最终以供应商账单为准。</p>
      <h2 id="support-records-heading" className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 py-3 text-base font-semibold text-gray-800">问答记录</h2>
      <div id="support-records" aria-labelledby="support-records-heading" aria-busy={busy} className={`space-y-3 ${busy||invalidDates||error?'pointer-events-none opacity-50':''}`}>{usage.items.map(turn=>{
        return <details key={turn.id} className="group rounded-xl bg-white p-4 shadow-sm"><summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden"><span aria-hidden="true" className="mt-0.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90">▸</span><div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap justify-between gap-2 text-xs text-gray-500"><span>{stamp(turn.createdAt)} · {state(turn.status)}</span><span>{turn.account||`游客 ${turn.identityHash?.slice(0,10)||'未记录'}`} · <span title={turn.clientIpTrusted?'代理已验证的客户端地址':'此记录未获得可信客户端地址；本地直连、代理未配置或历史未采集均可能导致。'}>{turn.clientIpTrusted?turn.clientIp:'IP未确认'}</span></span></div><p className="truncate text-sm">{turn.userText}</p></div></summary>
          <div className="mt-4 space-y-3"><p className="whitespace-pre-wrap break-words text-sm">问题：{turn.userText}</p><p className="whitespace-pre-wrap break-words text-sm">回答：{turn.answerText||'尚无回答'}</p><p className="break-all text-xs text-gray-400">请求：{turn.requestId} · 会话：{turn.conversationId} · 整轮：{turn.latencyMs??'未记录'} ms</p>
          <CallTable calls={turn.modelCalls||[]}/>{!turn.modelCalls?.length&&<p className="text-xs text-gray-500">本次未调用模型。</p>}
          {!turn.clearedAt&&(turn.identityHash||turn.userId||turn.clientIpTrusted)&&<button className={`${button} text-red-600`} onClick={()=>choose({source:'turn',id:turn.id,identityHash:turn.identityHash,userId:turn.userId,clientIp:turn.clientIpTrusted?turn.clientIp:null})}>限制此来源的智能客服访问</button>}
          </div></details>;})}{usage.items.length===0&&<p className="rounded-xl bg-white p-8 text-center text-gray-500">此范围内暂无记录</p>}</div></>}
    {risk&&<><div className="rounded-xl bg-white p-5 space-y-3 shadow-sm"><h2 className="font-semibold">生效中的封禁</h2>{risk.blocks.map(b=><div key={b.id} className="border-b pb-3 text-sm"><p className="break-all">{b.label} · {b.reason}</p><p className="text-xs text-gray-500">到期：{stamp(b.expiresAt)}</p><button disabled={saving} onClick={()=>void mutate({action:'revoke',id:b.id})} className={`${button} mt-2`}>解除封禁</button></div>)}{!risk.blocks.length&&<p className="text-sm text-gray-500">暂无生效封禁</p>}</div>
      <div className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold">风控事件</h2>{risk.events.map(e=><div key={e.id} className="border-b py-3 text-sm"><p>{stamp(e.createdAt)} · {state(e.category)} · {e.count} 次</p><p className="text-xs text-gray-500 break-all">{e.userId||`游客 ${e.identityHash?.slice(0,10)||'—'}`} · {e.clientIp||'IP未知'} {e.details?.reason}</p>{(e.identityHash||e.userId||e.clientIp)&&<button className={`${button} mt-2 text-red-600`} onClick={()=>choose({source:'event',id:e.id,identityHash:e.identityHash,userId:e.userId,clientIp:e.clientIp})}>限制此来源</button>}</div>)}{!risk.events.length&&<p className="text-sm text-gray-500">暂无风控事件</p>}</div></>}
    {(usage||risk)&&<div className="flex items-center justify-between"><span className="text-sm text-gray-500">共 {usage?.total??risk?.total} 条，第 {page} 页</span><div className="flex gap-2"><button className={button} disabled={busy||invalidDates||page===1} onClick={()=>setPage(p=>p-1)}>上一页</button><button className={button} disabled={busy||invalidDates||!(usage?.hasMore??risk?.hasMore)} onClick={()=>setPage(p=>p+1)}>下一页</button></div></div>}
    {target&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form role="dialog" aria-modal="true" aria-labelledby="support-block-title" onSubmit={e=>{e.preventDefault();void mutate({action:'block',source:target.source,id:target.id,kind,reason});}} className="w-full max-w-md rounded-xl bg-white p-6 space-y-4"><h2 id="support-block-title" className="font-semibold">暂停智能客服访问24小时</h2><p className="text-sm text-gray-500">仅限制模型咨询，登录、购买和常见问题仍可使用。共享 IP 可能对应多个访客。</p><label className="block text-sm">限制对象<select className={`block w-full ${control}`} value={kind} onChange={e=>setKind(e.target.value)}>{target.userId&&<option value="user">此账号</option>}{target.identityHash&&<option value="identity">此游客/身份</option>}{target.clientIp&&<option value="ip">此可信 IP（{target.clientIp}）</option>}</select></label><label className="block text-sm">原因<textarea required maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} className={`block w-full ${control}`}/></label><div className="flex gap-3"><button disabled={saving||!reason.trim()} className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-40">确认限制</button><button type="button" disabled={saving} className={button} onClick={()=>setTarget(null)}>取消</button></div></form></div>}
  </div>;
}
