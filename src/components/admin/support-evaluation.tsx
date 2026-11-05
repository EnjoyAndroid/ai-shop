'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUp, Download, Eye, FlaskConical, RefreshCw, Square } from 'lucide-react';
import { SupportMessageUi } from '@/components/shop/support-message-ui';
import { evaluationFailure } from '@/lib/support/evaluation/diagnostics';
import type { EvalMode, EvalSessionView, EvalSide, EvalVote } from '@/lib/support/evaluation/types';

type Daily = { limitCny: number; spentCny: number; heldCny: number };
type Scenario = { identity: 'guest' | 'member'; id: string; label: string; question: string; expected: string; history: Array<{userText:string;answerText:string}> };
type Setup = { configured: boolean; model: string; wireApi: string; fixtureVersion: string; scenarios: Scenario[]; dailyBudget: Daily };
const money = (n: number | null) => n === null ? '未知' : `¥${n.toFixed(5)}`;
const number = (n: number | null) => n === null ? '未知' : n.toLocaleString();
const storageKey = 'support-evaluation-session';
export function SupportEvaluation() {
  const [setup, setSetup] = useState<Setup | null>(null), [session, setSession] = useState<EvalSessionView | null>(null);
  const [mode, setMode] = useState<EvalMode>('full'), [scenario, setScenario] = useState('shopping'), [budget, setBudget] = useState(0.5);
  const [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [daily, setDaily] = useState<Daily | null>(null);
  const [configChanged, setConfigChanged] = useState(false), [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null), bottom = useRef<HTMLDivElement | null>(null);
  const chosen = setup?.scenarios.find(s => s.id === (session?.scenario || scenario));
  async function get(id?: string, signal?: AbortSignal) {
    const response = await fetch(`/api/admin/support/evaluation${id ? `?id=${encodeURIComponent(id)}` : ''}`, { cache:'no-store', signal });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '加载失败');
    setDaily(data.dailyBudget);
    if (id) setSession(data.session); else setSetup(data);
    return data;
  }
  useEffect(() => {
    const c = new AbortController();
    void (async () => {
      try {
        const data: Setup = await get(undefined, c.signal);
        setQuestion(data.scenarios[0].question);
        const id = sessionStorage.getItem(storageKey);
        if (id) { try { const restored = await get(id, c.signal); setQuestion(restored.session.turns.length ? '' : data.scenarios.find(s => s.id === restored.session.scenario)?.question || ''); } catch { sessionStorage.removeItem(storageKey); } }
      } catch (e) { if (!c.signal.aborted) setError(e instanceof Error ? e.message : '加载失败'); }
    })();
    return () => { c.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [session?.turns.length, busy]);
  async function mutate(body: unknown, signal?: AbortSignal) {
    const response = await fetch('/api/admin/support/evaluation', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'EVAL_CONFIG_CHANGED') setConfigChanged(true);
      throw new Error(data.error || '请求失败');
    }
    setConfigChanged(false);
    setSession(data.session); setDaily(data.dailyBudget); sessionStorage.setItem(storageKey, data.session.id);
    return data.session as EvalSessionView;
  }
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : '请求失败'); } finally { setBusy(false); }
  }
  async function send() {
    if (!question.trim() || busy || session?.restartRequired || configChanged) return;
    const text = question.trim(); controller.current = new AbortController();
    await act(async () => {
      const current = session || await mutate({action:'create', mode, scenario, budgetCny:budget}, controller.current!.signal);
      try { await mutate({action:'send',id:current.id,requestId:crypto.randomUUID(),question:text}, controller.current!.signal); setQuestion(''); }
      catch (e) {
        if (controller.current?.signal.aborted) { setError('已停止等待。请刷新结果确认已发出调用的状态和费用。'); return; }
        throw e;
      }
    });
  }
  function reset() {
    const selected = session?.scenario || scenario;
    if (session) { setMode(session.mode); setScenario(selected); setBudget(session.budgetCny); }
    setSession(null); sessionStorage.removeItem(storageKey); setError(''); setConfigChanged(false); setNotice('');
    setQuestion(setup?.scenarios.find(s => s.id === selected)?.question || '');
  }
  async function restartWithCurrentConfig() {
    if (!session) return;
    const old = session;
    const draft = question.trim() || old.turns[0]?.question || chosen?.question || '';
    await act(async () => {
      await get();
      await mutate({action:'create',mode:old.mode,scenario:old.scenario,budgetCny:old.budgetCny});
      setQuestion(draft);
      setNotice('已按当前配置新建对照，问题已保留。点击“发送给两版”开始；新建本身不调用模型。');
    });
  }
  function download() {
    if (!session) return;
    const payload = { exportedAt:new Date().toISOString(), fixtureVersion:setup?.fixtureVersion,
      mode:session.mode, model:session.model, wireApi:session.wireApi, session, dailyBudget:daily,
      note:'合成测试资料；费用按配置费率估算，非供应商账单。单次结果不代表稳定提升。未揭晓时不包含版本映射。' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a = document.createElement('a'); a.href=url; a.download=`support-comparison-${session.id}.json`; a.click(); URL.revokeObjectURL(url);
  }
  const restartRequired = Boolean(session?.restartRequired || configChanged);
  const needsVote = session?.mode === 'prompt' && Boolean(session.turns.length) && !session.turns.at(-1)?.vote;
  return <div className="mx-auto max-w-6xl space-y-6">
    <Link href="/admin/support" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft size={16}/>智能客服</Link>
    <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-indigo-600"><FlaskConical size={16}/>本地评测实验室</div><h1 className="text-2xl font-semibold text-gray-900">双版本试聊</h1><p className="mt-2 text-sm text-gray-500">同一个问题，两种回答。先看效果，再揭晓版本。</p></div><div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm"><div className="text-xs text-gray-500">今日独立评测预算</div><div className="mt-1 font-medium">{money(daily?.spentCny ?? 0)} / ¥{daily?.limitCny ?? 2}</div><div className="mt-1 text-xs text-gray-400">预占待结算 {money(daily?.heldCny ?? 0)}</div></div></header>
    {notice&&<p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {restartRequired&&session&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">这组评测使用的是旧配置</p><p className="mt-1 leading-6">模型、连接地址或费率已更新。请新建对照后继续，旧结果和已记录费用会保留。</p><button disabled={busy} onClick={()=>void restartWithCurrentConfig()} className="mt-3 rounded-lg bg-amber-900 px-4 py-2 text-white disabled:opacity-50">按当前配置新建对照</button><p className="mt-2 text-xs text-amber-800">保留当前模式、场景、预算和待发问题；不会自动发送或产生模型费用。</p></div>}
    {error && !restartRequired && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!setup && !error && <p role="status">正在加载评测配置…</p>}
    {setup && <>
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 md:grid-cols-[1fr_1fr_150px]">
          <label className="text-sm font-medium">比较方式<select disabled={Boolean(session)||busy} value={session?.mode || mode} onChange={e=>setMode(e.target.value as EvalMode)} className="mt-2 w-full rounded-lg border bg-white p-2.5 disabled:bg-gray-50"><option value="full">完整旧版 / 新版</option><option value="prompt">只比较提示词</option></select></label>
          <label className="text-sm font-medium">测试场景<select disabled={Boolean(session)||busy} value={session?.scenario || scenario} onChange={e=>{setScenario(e.target.value);setQuestion(setup.scenarios.find(s=>s.id===e.target.value)?.question || '');}} className="mt-2 w-full rounded-lg border bg-white p-2.5 disabled:bg-gray-50">{setup.scenarios.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className="text-sm font-medium">本组预算<select disabled={Boolean(session)||busy} value={session?.budgetCny ?? budget} onChange={e=>setBudget(Number(e.target.value))} className="mt-2 w-full rounded-lg border bg-white p-2.5 disabled:bg-gray-50">{[0.1,0.5,1,2].map(n=><option key={n} value={n}>¥{n.toFixed(2)}</option>)}</select></label>
        </div>
        <p className="mt-4 text-sm leading-6 text-gray-500">{(session?.mode||mode)==='full'?'两边分别延续自己的回答，比较提示词、工具说明、上下文和输出预算的整体变化。':'两边使用相同历史、工具和预算，仅更换系统提示词。每轮评价选择的回答会进入双方共同历史；平局或都不好时沿用 A。'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-400"><span>模型：{session?.model || setup.model}</span><span>协议：{session?.wireApi || setup.wireApi}</span><span>资料：{setup.fixtureVersion}</span><span>测试身份：{chosen?.identity==='member'?'已登录会员':'游客（免登录查询订单）'}</span><span>保留24小时 · 最多20轮</span></div>
        {!setup.configured&&<p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">开发模型尚未配置。请在本地 .env 配置开发专用模型后重启；页面不会使用生产凭据。</p>}
        <details className="mt-4 border-t pt-3 text-sm"><summary className="cursor-pointer text-indigo-600">查看测试资料与判断标准</summary><div className="mt-3 space-y-2 leading-6 text-gray-600"><p>所有商品、订单、支付方式和售后知识均为固定合成资料，不查询真实商城数据。请使用模拟问题，不输入真实密码、卡密或个人信息。</p><p>{chosen?.expected}</p><p>测试月卡：ChatGPT Plus ¥99，Claude Pro ¥129（缺货），Cursor Pro ¥159。价格变化场景中 ChatGPT 也缺货。</p>{chosen?.history.length ? <div className="rounded-lg bg-gray-50 p-3"><p className="mb-2 font-medium">预置对话（两边相同）</p>{chosen.history.map((h,i)=><p key={i} className="text-xs">{i+1}. 用户：{h.userText} / 客服：{h.answerText}</p>)}</div>:null}</div></details>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="text-gray-500">{session?`${session.turns.length} 轮 · 本组已结算 ${money(session.spentCny)} · 预占 ${money(session.heldCny)}`:'发送后开始对照；两侧会分别产生模型费用。'}</span><div className="flex flex-wrap gap-2">{session&&<><button disabled={busy} onClick={()=>void act(()=>get(session.id))} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 disabled:opacity-50"><RefreshCw size={14}/>刷新结果</button><button disabled={busy||session.revealed} onClick={()=>void act(()=>mutate({action:'reveal',id:session.id}))} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 disabled:opacity-50"><Eye size={14}/>{session.revealed?'版本已揭晓':'揭晓版本'}</button><button disabled={busy} onClick={download} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 disabled:opacity-50"><Download size={14}/>导出</button><button disabled={busy} onClick={reset} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-50">新建同场景</button></>}</div></div>
      {!session?.turns.length&&!busy&&<div className="rounded-2xl border border-dashed border-gray-300 bg-white/60 px-6 py-12 text-center"><FlaskConical className="mx-auto mb-3 text-indigo-400" size={28}/><p className="font-medium text-gray-700">从一个真实的服务场景开始</p><p className="mt-2 text-sm text-gray-400">输入下面的问题，或选择“多轮记忆”感受上下文差异。</p></div>}
      {session?.turns.map((turn,index)=><section key={turn.id} className="space-y-3"><div className="flex items-start gap-3 rounded-xl bg-slate-800 px-4 py-3 text-white"><span className="shrink-0 text-xs leading-6 text-slate-400">{String(index+1).padStart(2,'0')}</span><p className="whitespace-pre-wrap break-words text-sm leading-6">{turn.question}</p></div><div className="grid gap-4 lg:grid-cols-2">{(['A','B'] as const).map(side=>{const r=turn.results[side], diagnostic=evaluationFailure(r);return <article key={side} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"><header className="flex items-center justify-between border-b border-gray-100 px-5 py-3"><h2 className="font-semibold">回答 {side}{session.versions?.[side]&&<span className="ml-2 text-xs font-normal text-indigo-600">{session.versions[side]}</span>}</h2><span className={`text-xs ${r.status==='COMPLETED'?'text-emerald-600':'text-amber-600'}`}>{r.status==='COMPLETED'?'已完成':diagnostic?.label||r.status}</span></header><p className="min-h-28 flex-1 whitespace-pre-wrap break-words px-5 py-5 text-sm leading-7 text-gray-700">{diagnostic?.message||r.answer}</p><div className="px-5 pb-4"><SupportMessageUi value={r.ui}/>{r.productPreviews?.map(product=><details key={product.name} className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-sm"><summary className="cursor-pointer font-medium text-indigo-700">查看 {product.name}（模拟详情）</summary><p className="mt-2 text-gray-600">¥{product.priceCny} · {product.stock>0?`有货 ${product.stock} 份`:'缺货'}</p><p className="mt-1 text-gray-600">{product.description}</p><p className="mt-2 text-xs text-gray-400">合成测试商品，仅用于评测，无购买操作。</p></details>)}</div><div className="grid grid-cols-3 gap-3 border-t bg-gray-50/70 px-5 py-3 text-xs text-gray-500"><span>耗时<br/><strong className="font-medium text-gray-800">{(r.latencyMs/1000).toFixed(2)} 秒</strong></span><span>输入 / 输出<br/><strong className="font-medium text-gray-800">{number(r.inputTokens)} / {number(r.outputTokens)}</strong></span><span>估算费用<br/><strong className="font-medium text-gray-800">{money(r.costCny)}</strong></span></div><details className="border-t px-5 py-3 text-xs"><summary className="cursor-pointer text-gray-500">{r.modelCalls} 次模型 · {r.toolCalls} 次工具请求 · {r.toolExecutions} 次实际查询</summary><div className="mt-3 space-y-3">{r.calls.map((c,i)=><p key={i} className="break-words text-gray-500">{c.phase==='scope'?'规划':'回答'} #{c.sequence} · {(c.latencyMs/1000).toFixed(2)}秒 · 缓存 {number(c.cachedTokens)} Token · {c.responseModel||'模型未返回'} {c.errorCode||''}</p>)}{r.tools.map((t,i)=><pre key={i} className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2">{JSON.stringify(t,null,2)}</pre>)}</div></details></article>;})}</div><div className="flex flex-wrap items-center justify-center gap-2 py-1"><span className="mr-1 text-xs text-gray-500">哪条更准确、有用、少追问？</span>{([['A','A 更好'],['B','B 更好'],['tie','差不多'],['neither','都不好']] as const).map(([vote,label])=><button key={vote} disabled={busy||index!==session.turns.length-1} onClick={()=>void act(()=>mutate({action:'rate',id:session.id,turnId:turn.id,vote:vote as EvalVote}))} className={`rounded-full border px-3 py-1.5 text-xs disabled:opacity-50 ${turn.vote===vote?'border-indigo-500 bg-indigo-50 text-indigo-700':'bg-white text-gray-500'}`}>{label}</button>)}{turn.vote&&<span className="text-xs text-gray-400">已记录{turn.ratedBlind?'盲评':'揭晓后评价'}</span>}</div></section>)}
      {busy&&<div role="status" className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-700">正在处理两侧结果，请稍候…</div>}
      <div ref={bottom}/>
      <form onSubmit={e=>{e.preventDefault();void send();}} className="sticky bottom-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-lg">
        {needsVote&&<p className="mb-2 text-xs text-amber-700">请先评价上一轮，确定下一轮双方共用的历史。</p>}
        {session?.pending&&!busy&&<p className="mb-2 text-xs text-amber-700">有未完成请求，请先刷新结果。若进程已中断，请新建评测。</p>}
        <label htmlFor="evaluation-question" className="sr-only">对照问题</label><textarea id="evaluation-question" rows={2} maxLength={2000} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="输入相同的问题，或继续追问…" className="w-full resize-y bg-transparent text-sm leading-6 outline-none"/>
        <div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-gray-400">{question.length}/2000 · 相同模型和资料，回答仍有随机性</span>{busy?<button type="button" onClick={()=>controller.current?.abort()} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"><Square size={14}/>停止等待</button>:<button disabled={!setup.configured||!question.trim()||Boolean(needsVote)||session?.pending||restartRequired} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"><ArrowUp size={16}/>发送给两版</button>}</div>
      </form>
    </>}
  </div>;
}
