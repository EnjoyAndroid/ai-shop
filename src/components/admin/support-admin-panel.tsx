"use client";
import { useEffect, useState } from 'react';
import { SupportMonitoring } from './support-monitoring';
type Article = { id?: string; title: string; question: string; aliases: string[]; keywords: string[]; category: string; content: string; status: 'DRAFT'|'PUBLISHED'; version?: number };
const empty: Article = {title:'',question:'',aliases:[],keywords:[],category:'general',content:'',status:'DRAFT'};
type FixedLimits = {plannerMaxOutputTokens:number;answerMaxOutputTokens:number;upstreamTimeoutMs:number;totalTimeoutMs:number;maxModelRounds:number;maxToolCalls:number;identityConcurrent:number;ipConcurrent:number;globalConcurrent:number;duplicateWindowSeconds:number;duplicateThreshold:number;cooldownSeconds:number};
type Config = {provider:string;model:string;dailyBudgetCny:number;configured:boolean;apiKeyConfigured:boolean;detailRetentionDays:number;usageRetentionDays:number;guestDailyModelTurns:number;memberDailyModelTurns:number;guestPerMinute:number;memberPerMinute:number;fixedLimits:FixedLimits};
export function SupportAdminPanel() {
  const [tab,setTab]=useState<'knowledge'|'usage'|'risk'|'config'>('usage');
  const [focusTurnId,setFocusTurnId]=useState<string|null>(null);
  const [articles,setArticles]=useState<Article[]>([]), [article,setArticle]=useState<Article>(empty);
  const [config,setConfig]=useState<Config|null>(null),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
  async function loadArticles() {try {const r=await fetch('/api/admin/support/knowledge',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error);setArticles(d.articles);}catch{setMessage('加载知识库失败，请刷新重试');}}
  useEffect(()=>{void loadArticles();},[]);
  useEffect(()=>{if(tab!=='config')return;const c=new AbortController();setMessage('');void (async()=>{try{const r=await fetch('/api/admin/support/config',{cache:'no-store',signal:c.signal});const d=await r.json();if(!r.ok)throw new Error(d.error);setConfig(d);}catch{if(!c.signal.aborted)setMessage('加载配置失败，请重试');}})();return()=>c.abort();},[tab]);
  async function save(action:'save'|'publish') {setSaving(true);try{const r=await fetch('/api/admin/support/knowledge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...article,action})});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage(action==='publish'?'知识已发布':'草稿已保存');setArticle(empty);await loadArticles();}catch(e){setMessage(e instanceof Error?e.message:'保存失败');}finally{setSaving(false);}}
  async function saveConfig(){if(!config)return;setSaving(true);try{const payload={dailyBudgetCny:Number(config.dailyBudgetCny),detailRetentionDays:Number(config.detailRetentionDays),usageRetentionDays:Number(config.usageRetentionDays),guestDailyModelTurns:Number(config.guestDailyModelTurns),memberDailyModelTurns:Number(config.memberDailyModelTurns),guestPerMinute:Number(config.guestPerMinute),memberPerMinute:Number(config.memberPerMinute)};const r=await fetch('/api/admin/support/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error);setMessage('客服配置已保存，新提问按新限额检查，历史数据将在定时清理时按新保留期处理');}catch(e){setMessage(e instanceof Error?e.message:'保存失败');}finally{setSaving(false);}}
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold text-gray-800">智能客服</h1><p className="mt-2 text-sm text-gray-500">维护知识、查看咨询记录和用量，处理异常访问。</p></div>
    <div className="flex flex-wrap gap-2 border-b">{([['usage','Token 统计'],['risk','风控排查'],['config','配置'],['knowledge','知识库']] as const).map(([key,label])=><button key={key} onClick={()=>{setFocusTurnId(null);setTab(key);setMessage('');}} className={`px-4 py-2 text-sm ${tab===key?'border-b-2 border-primary font-semibold text-primary':'text-gray-500'}`}>{label}</button>)}</div>
    {message&&<p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">{message}</p>}
    {tab === "knowledge" && <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]"><div className="rounded-xl bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">知识条目</h2><button onClick={() => setArticle(empty)} className="text-sm text-primary">新建</button></div><div className="space-y-2">{articles.map(item => <button key={item.id} onClick={() => setArticle(item)} className={`block w-full rounded-lg border p-3 text-left ${article.id === item.id ? "border-primary bg-blue-50" : "hover:bg-gray-50"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{item.title}</span><span className={`text-xs ${item.status === "PUBLISHED" ? "text-emerald-600" : "text-amber-600"}`}>{item.status === "PUBLISHED" ? "已发布" : "草稿"}</span></div><p className="mt-1 truncate text-xs text-gray-500">{item.question}</p></button>)}{!articles.length && <p className="py-8 text-center text-sm text-gray-400">暂无知识条目</p>}</div></div><div className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 font-semibold">{article.id ? "编辑知识" : "新建知识"}</h2><div className="space-y-3"><input value={article.title} onChange={event => setArticle({ ...article, title: event.target.value })} placeholder="标题" className="w-full rounded-lg border px-3 py-2 text-sm" /><input value={article.question} onChange={event => setArticle({ ...article, question: event.target.value })} placeholder="标准问题" className="w-full rounded-lg border px-3 py-2 text-sm" /><input value={article.aliases.join("、")} onChange={event => setArticle({ ...article, aliases: event.target.value.split("、").map(value => value.trim()).filter(Boolean) })} placeholder="相似问法，用顿号分隔" className="w-full rounded-lg border px-3 py-2 text-sm" /><input value={article.keywords.join("、")} onChange={event => setArticle({ ...article, keywords: event.target.value.split("、").map(value => value.trim()).filter(Boolean) })} placeholder="关键词，用顿号分隔" className="w-full rounded-lg border px-3 py-2 text-sm" /><input value={article.category} onChange={event => setArticle({ ...article, category: event.target.value })} placeholder="分类" className="w-full rounded-lg border px-3 py-2 text-sm" /><textarea rows={10} value={article.content} onChange={event => setArticle({ ...article, content: event.target.value })} placeholder="客服回答内容" className="w-full rounded-lg border px-3 py-2 text-sm" /><div className="flex gap-3"><button onClick={() => void save("save")} className="rounded-lg border px-4 py-2 text-sm">保存草稿</button><button onClick={() => void save("publish")} className="rounded-lg bg-primary px-4 py-2 text-sm text-white">发布上线</button></div></div></div></div>}
    {(tab==='usage'||tab==='risk')&&<SupportMonitoring key={`${tab}:${focusTurnId||'all'}`} view={tab} focusTurnId={focusTurnId} onClearFocus={()=>setFocusTurnId(null)} onViewTurn={turnId=>{setFocusTurnId(turnId);setTab('usage');}}/>}
    {tab==='config'&&(config?<form onSubmit={e=>{e.preventDefault();void saveConfig();}} className="w-full max-w-4xl space-y-6 rounded-xl bg-white p-5 shadow-sm sm:p-6">
      <div className="space-y-4">
        <h2 className="font-semibold">智能客服配置</h2>
        <div className="grid gap-x-8 gap-y-2 text-sm leading-6 text-gray-500 sm:grid-cols-2">
          <p className="break-all">当前模型：{config.model}</p>
          <p>网关：{config.provider} · 模型凭据：{config.apiKeyConfigured?'已配置':'未配置'}</p>
          <p>规划输出上限：{config.fixedLimits.plannerMaxOutputTokens.toLocaleString('en-US')} Token</p>
          <p>回答输出上限：{config.fixedLimits.answerMaxOutputTokens.toLocaleString('en-US')} Token</p>
          <p>单次模型请求超时：{config.fixedLimits.upstreamTimeoutMs/1000} 秒</p>
          <p>单次客服总时限：{config.fixedLimits.totalTimeoutMs/1000} 秒</p>
          <p>模型请求上限：{config.fixedLimits.maxModelRounds} 轮</p>
          <p>工具调用上限：{config.fixedLimits.maxToolCalls} 次</p>
          <p>单身份同时处理：{config.fixedLimits.identityConcurrent} 个模型提问</p>
          <p>单可信 IP / 全站同时处理：{config.fixedLimits.ipConcurrent} / {config.fixedLimits.globalConcurrent} 个请求</p>
          <p className="sm:col-span-2">重复问题冷却：{config.fixedLimits.duplicateWindowSeconds} 秒内第 {config.fixedLimits.duplicateThreshold} 次相同提问触发冷却，持续 {config.fixedLimits.cooldownSeconds/60} 分钟</p>
        </div>
      </div>
      <div className="grid gap-4 border-t border-gray-100 pt-6 sm:grid-cols-3"><label className="block text-sm" htmlFor="support-budget">每日预算（元）<input id="support-budget" required type="number" min="0" max="100000" step="0.01" value={config.dailyBudgetCny} onChange={e=>setConfig({...config,dailyBudgetCny:Number(e.target.value)})} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <label className="block text-sm">问答和身份/IP保留天数<input required type="number" min="1" max="365" value={config.detailRetentionDays} onChange={e=>setConfig({...config,detailRetentionDays:Number(e.target.value)})} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <label className="block text-sm">用量记录保留天数<input required type="number" min="1" max="730" value={config.usageRetentionDays} onChange={e=>setConfig({...config,usageRetentionDays:Number(e.target.value)})} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">游客每日模型提问<input required type="number" min="1" max="10000" value={config.guestDailyModelTurns} onChange={e=>setConfig({...config,guestDailyModelTurns:Number(e.target.value)})} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <label className="block text-sm">会员每日模型提问<input required type="number" min="1" max="10000" value={config.memberDailyModelTurns} onChange={e=>setConfig({...config,memberDailyModelTurns:Number(e.target.value)})} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <label className="block text-sm">游客每分钟模型提问<input required type="number" min="1" max="1000" value={config.guestPerMinute} onChange={e=>setConfig({...config,guestPerMinute:Number(e.target.value)})} className="mt-1 w-full rounded-lg border px-3 py-2"/></label>
      <label className="block text-sm">会员每分钟模型提问<input required type="number" min="1" max="1000" value={config.memberPerMinute} onChange={e=>setConfig({...config,memberPerMinute:Number(e.target.value)})} className="mt-1 w-full rounded-lg border px-3 py-2"/></label></div>
      <p className="text-xs text-gray-500">每日额度按北京时间自然日计算，每分钟限制按首次提问起的60秒窗口计算，仅统计模型提问。调整额度不会清零已用次数；常见问题不消耗额度。预算为0时暂停模型回答。</p><p className="text-xs text-amber-700">用量保留天数不能少于明细保留天数。缩短保留期后，下次定时清理会删除超期数据，延长保留期不能恢复已清理数据。</p>
      <button disabled={saving||!Number.isFinite(config.dailyBudgetCny)||config.dailyBudgetCny<0} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">{saving?'保存中…':'保存配置'}</button>

    </form>:<p>加载中…</p>)}
  </div>;
}
