"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, ThumbsDown, ThumbsUp, X } from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; text: string; turnId?: string };
type Bootstrap = { quickQuestions: string[]; contact: { telegramUrl: string; wechatSupportText: string; wechatSupportQrUrl: string }; siteName: string };

function requestId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(16).slice(2)}`; }

function conversationMessages(turns: Array<{ id: string; userText: string; answerText: string | null }>, siteName: string): Message[] {
  const messages: Message[] = [];
  for (const turn of turns) {
    messages.push({ id: `${turn.id}-user`, role: "user", text: turn.userText });
    if (turn.answerText) messages.push({ id: turn.id, role: "assistant", text: turn.answerText, turnId: turn.id });
  }
  return messages.length ? messages : [{ id: "welcome", role: "assistant", text: `你好，我是${siteName || "AI Shop"}智能客服，可以帮你查询购买流程、商品库存、支付方式和本人订单。` }];
}

export function SupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!open || pathname.startsWith("/admin")) return; void (async () => {
    try {
      const [bootResponse, currentResponse] = await Promise.all([fetch("/api/support/bootstrap", { cache: "no-store" }), fetch("/api/support/conversations", { cache: "no-store" })]);
      const boot = await bootResponse.json();
      const current = await currentResponse.json();
      if (!bootResponse.ok || !currentResponse.ok) throw new Error(boot.error || current.error || "客服暂时不可用");
      let conversation = current.conversation;
      if (!conversation) {
        const createdResponse = await fetch("/api/support/conversations", { method: "POST" });
        const created = await createdResponse.json();
        if (!createdResponse.ok) throw new Error(created.error || "客服暂时不可用");
        conversation = created.conversation;
      }
      setBootstrap(boot); setConversationId(conversation.id); setMessages(conversationMessages(conversation.turns || [], boot.siteName));
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "客服暂时不可用"); }
  })(); }, [open, pathname]);

  if (pathname.startsWith("/admin")) return null;

  async function send(text = input) {
    const value = text.trim();
    if (!value || loading || !conversationId) return;
    setInput(""); setError(""); setLoading(true);
    const userMessage: Message = { id: requestId(), role: "user", text: value };
    setMessages(current => [...current, userMessage]);
    try {
      const response = await fetch(`/api/support/conversations/${conversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: userMessage.id, message: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "客服暂时无法回答");
      setMessages(current => [...current, { id: data.turnId || requestId(), role: "assistant", text: data.answer, turnId: data.turnId }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "客服暂时无法回答"); }
    finally { setLoading(false); setTimeout(() => inputRef.current?.focus(), 0); }
  }

  async function feedback(turnId: string, value: 1 | -1) { await fetch(`/api/support/turns/${turnId}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) }).catch(() => undefined); }

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="打开智能客服" className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"><MessageCircle size={20} />智能客服</button>
    {open && <div className="fixed inset-0 z-50 bg-black/30 md:pointer-events-none md:bg-transparent" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="智能客服" onClick={event => event.stopPropagation()} className="pointer-events-auto absolute bottom-0 right-0 flex h-[min(760px,100dvh)] w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl md:bottom-5 md:right-5 md:h-[min(720px,calc(100dvh-2.5rem))] md:rounded-2xl md:border">
        <header className="flex items-center justify-between bg-blue-600 px-5 py-4 text-white"><div className="flex items-center gap-3"><Bot size={22} /><div><h2 className="font-semibold">智能客服</h2><p className="text-xs text-blue-100">实时商品与订单帮助</p></div></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭智能客服" className="rounded-lg p-2 hover:bg-white/15"><X size={20} /></button></header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">{!bootstrap && !error && <p className="text-center text-sm text-slate-500"><Loader2 className="mr-2 inline animate-spin" size={16} />正在连接客服…</p>}{messages.map(message => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-white text-slate-700 shadow-sm"}`}><p className="whitespace-pre-wrap">{message.text}</p>{message.role === "assistant" && message.turnId && <div className="mt-2 flex gap-1"><button type="button" aria-label="回答有帮助" onClick={() => void feedback(message.turnId!, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-600"><ThumbsUp size={14} /></button><button type="button" aria-label="回答没帮助" onClick={() => void feedback(message.turnId!, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"><ThumbsDown size={14} /></button></div>}</div></div>)}{loading && <div className="flex"><div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-sm text-slate-500 shadow-sm"><Loader2 className="mr-2 inline animate-spin" size={15} />正在查询…</div></div>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}</div>
        {bootstrap && messages.length <= 1 && <div className="border-t bg-white px-4 py-3"><p className="mb-2 text-xs text-slate-400">你可以直接问：</p><div className="flex flex-wrap gap-2">{bootstrap.quickQuestions.map(question => <button key={question} type="button" onClick={() => void send(question)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600">{question}</button>)}</div></div>}
        <form onSubmit={event => { event.preventDefault(); void send(); }} className="flex items-end gap-2 border-t bg-white p-3"><textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} maxLength={2000} rows={2} placeholder="请输入你的问题，Enter 发送" className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" disabled={loading || !conversationId} /><button type="submit" disabled={loading || !input.trim() || !conversationId} aria-label="发送问题" className="rounded-xl bg-blue-600 p-3 text-white disabled:cursor-not-allowed disabled:opacity-40"><Send size={18} /></button></form>
      </div>
    </div>}
  </>;
}

