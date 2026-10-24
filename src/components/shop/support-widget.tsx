"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { shouldSubmitSupportOnEnter } from "@/lib/support/input";
import { SUPPORT_GREETING } from "@/lib/support/policy";

import { type SupportUi, readSupportUi, cleanSupportAnswer } from "@/lib/support/ui";
import { SupportMessageUi } from "./support-message-ui";
type Message = { id: string; role: "user" | "assistant"; text: string; turnId?: string; ui?: SupportUi };
type Bootstrap = { quickQuestions: string[]; contact: { telegramUrl: string; wechatSupportText: string; wechatSupportQrUrl: string }; siteName: string };

function requestId() { return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(16).slice(2)}`; }

function conversationMessages(turns: Array<{ id: string; userText: string; answerText: string | null; ui?: SupportUi | null }>, contact?: Bootstrap["contact"]): Message[] {
  const messages: Message[] = [{ id: "welcome", role: "assistant", text: SUPPORT_GREETING }];
  for (const turn of turns) {
    messages.push({ id: `${turn.id}-user`, role: "user", text: turn.userText });
    if (turn.answerText) {
      const ui = readSupportUi(turn.ui);
      if (!ui.images.length && contact?.wechatSupportQrUrl && /微信客服|二维码|res\.cloudinary\.com|cloudinary\.com/i.test(turn.answerText)) ui.images.push({ alt: "微信客服二维码", url: contact.wechatSupportQrUrl });
      const text = contact?.wechatSupportQrUrl ? turn.answerText.replace(/!?\[[^\]]*\]\(https?:\/\/[^)]+\)|https?:\/\/[^\s)]+/gi, "微信客服二维码见下方") : turn.answerText;
      messages.push({ id: turn.id, role: "assistant", text: cleanSupportAnswer(text, ui), turnId: turn.id, ui });
    }
  }
  return messages.length ? messages : [{ id: "welcome", role: "assistant", text: SUPPORT_GREETING }];
}

export function SupportWidget() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  if (pathname.startsWith("/admin") || status === "loading") return null;
  return <SupportSession key={session?.user?.id || "guest"} />;
}

function SupportSession() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const sending = useRef(false);
  const composing = useRef(false);
  const requestAbort = useRef<AbortController | null>(null);
  const openedOnce = useRef(false);
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => () => { generation.current++; requestAbort.current?.abort(); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useLayoutEffect(() => {
    const container = messagesRef.current;
    if (open && container) container.scrollTop = container.scrollHeight;
  }, [open, messages, loading, error, quickOpen]);

  useEffect(() => { if (!open || pathname.startsWith("/admin")) return; setQuickOpen(!openedOnce.current); openedOnce.current = true; const controller = new AbortController(); let cancelled = false; setConversationId(""); setMessages([]); setBootstrap(null); setError(""); void (async () => {
    try {
      const [bootResponse, currentResponse] = await Promise.all([fetch("/api/support/bootstrap", { cache: "no-store", signal: controller.signal }), fetch("/api/support/conversations", { cache: "no-store", signal: controller.signal })]);
      const boot = await bootResponse.json();
      const current = await currentResponse.json();
      if (!bootResponse.ok || !currentResponse.ok) throw new Error(boot.error || current.error || "客服暂时不可用");
      let conversation = current.conversation;
      if (!conversation) {
        const createdResponse = await fetch("/api/support/conversations", { method: "POST", signal: controller.signal });
        const created = await createdResponse.json();
        if (!createdResponse.ok) throw new Error(created.error || "客服暂时不可用");
        conversation = created.conversation;
      }
      if (cancelled) return;
      setBootstrap(boot); setConversationId(conversation.id); setMessages(conversationMessages(conversation.turns || [], boot.contact));
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch (cause) { if (!cancelled && !(cause instanceof DOMException && cause.name === "AbortError")) setError(cause instanceof Error ? cause.message : "客服暂时不可用"); }
  })(); return () => { cancelled = true; controller.abort(); generation.current++; requestAbort.current?.abort(); sending.current = false; setLoading(false); }; }, [open, pathname]);

  if (pathname.startsWith("/admin")) return null;

  async function send(text = input) {
    const value = text.trim();
    if (!value || sending.current || composing.current || !conversationId) return;
    sending.current = true;
    const requestGeneration = generation.current;
    const controller = new AbortController(); requestAbort.current = controller;
    setInput(""); setError(""); setLoading(true);
    const userMessage: Message = { id: requestId(), role: "user", text: value };
    setMessages(current => [...current, userMessage]);
    try {
      const response = await fetch(`/api/support/conversations/${conversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: userMessage.id, message: value }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "客服暂时无法回答");
      if (generation.current !== requestGeneration) return;
      const ui = readSupportUi(data.ui);
      setMessages(current => [...current, { id: data.turnId || requestId(), role: "assistant", text: cleanSupportAnswer(data.answer, ui), turnId: data.turnId, ui }]);
    } catch (cause) { if (generation.current === requestGeneration && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "客服暂时无法回答"); }
    finally { if (generation.current === requestGeneration) { sending.current = false; setLoading(false); setTimeout(() => inputRef.current?.focus(), 0); } }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="打开智能客服" className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"><MessageCircle size={20} />小AI同学</button>
    {open && <div className="fixed inset-0 z-50 bg-black/30 md:pointer-events-none md:bg-transparent" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="智能客服" onClick={event => event.stopPropagation()} className="pointer-events-auto absolute bottom-0 right-0 flex h-[min(760px,100dvh)] w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl md:bottom-5 md:right-5 md:h-[min(720px,calc(100dvh-2.5rem))] md:rounded-2xl md:border">
        <header className="flex items-center justify-between bg-blue-600 px-5 py-4 text-white"><div className="flex items-center gap-3"><Bot size={22} /><h2 className="font-semibold">小AI同学</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="关闭智能客服" className="rounded-lg p-2 hover:bg-white/15"><X size={20} /></button></header>
        <div ref={messagesRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-auto bg-slate-50 p-4">{!bootstrap && !error && <p className="text-center text-sm text-slate-500"><Loader2 className="mr-2 inline animate-spin" size={16} />正在连接客服…</p>}{messages.map(message => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "rounded-br-sm bg-blue-600 text-white" : "rounded-bl-sm bg-white text-slate-700 shadow-sm"}`}><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>{message.role === "assistant" && <SupportMessageUi value={message.ui} onNavigate={() => setOpen(false)} />}</div></div>)}{loading && <div className="flex"><div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 text-sm text-slate-500 shadow-sm"><Loader2 className="mr-2 inline animate-spin" size={15} />正在查询…</div></div>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}</div>
        {bootstrap && <div className="border-t bg-white px-4 py-2"><button type="button" aria-expanded={quickOpen} onClick={() => setQuickOpen(value => !value)} className="flex w-full items-center justify-between text-left text-xs text-slate-400"><span>常见问题</span><span aria-hidden="true">{quickOpen ? "收起" : "展开"}</span></button>{quickOpen && <div className="mt-2 flex flex-wrap gap-2">{bootstrap.quickQuestions.map(question => <button key={question} type="button" onClick={() => void send(question)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-600">{question}</button>)}</div>}</div>}
        <form onSubmit={event => { event.preventDefault(); void send(); }} className="flex shrink-0 items-center gap-2 border-t bg-white p-3"><textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => { if (!composing.current && shouldSubmitSupportOnEnter(event)) { event.preventDefault(); void send(); } }} maxLength={2000} rows={2} placeholder="请输入你的问题，Enter 发送" className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" disabled={loading || !conversationId} /><button type="submit" disabled={loading || !input.trim() || !conversationId} aria-label="发送问题" className="inline-flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-xl bg-blue-600 text-white disabled:cursor-not-allowed disabled:opacity-40"><Send size={18} /></button></form>
      </div>
    </div>}
  </>;
}

