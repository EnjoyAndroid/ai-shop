"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, X } from "lucide-react";

type Status = "AVAILABLE" | "LOCKED" | "INVALID";
type Filter = Status | "ALL";
interface Card { id: string; status: Status; batchNo: string | null; createdAt: string; updatedAt: string; canManage: boolean; }
interface CardList { cards: Card[]; total: number; page: number; pageSize: number; }
interface Detail { id: string; content: string; batchNo: string; updatedAt: string; }
const labels = { AVAILABLE: "可用", LOCKED: "订单占用", INVALID: "失效" };
const colors = { AVAILABLE: "bg-green-50 text-green-700", LOCKED: "bg-amber-50 text-amber-700", INVALID: "bg-gray-100 text-gray-600" };

export function CardKeyInventory({ productId, revision, onChanged }: { productId: string; revision: number; onChanged: () => void }) {
  const [filter, setFilter] = useState<Filter>("AVAILABLE");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<CardList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [message, setMessage] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [reading, setReading] = useState("");
  const [editing, setEditing] = useState<Detail | null>(null);
  const [deleting, setDeleting] = useState<Card | null>(null);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [supportsTextMask, setSupportsTextMask] = useState(true);
  const controllerRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => { setSupportsTextMask(CSS.supports("-webkit-text-security", "disc")); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setData(null); setError(""); setRevealed({}); setReading("");
    const query = new URLSearchParams({ productId, status: filter, page: String(page) });
    void fetch(`/api/admin/cardkeys?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "加载卡密失败");
      if (!controller.signal.aborted) {
        if (result.total > 0 && page > Math.ceil(result.total / result.pageSize)) { setPage(Math.ceil(result.total / result.pageSize)); return; }
        setData(result);
      }
    }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "加载失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); controllerRef.current?.abort(); };
  }, [productId, filter, page, revision, refresh]);

  useEffect(() => {
    if (editing || deleting) dialogRef.current?.showModal();
    else if (dialogRef.current?.open) { dialogRef.current.close(); triggerRef.current?.focus(); }
  }, [Boolean(editing || deleting)]);

  function closeDialog() {
    if (saving) return;
    setEditing(null); setDeleting(null); setDialogError(""); setShowPassword(false);
  }

  async function readCard(card: Card, edit = false) {
    if (edit) triggerRef.current = document.activeElement as HTMLElement;
    if (!edit && Object.hasOwn(revealed, card.id)) {
      setRevealed(current => { const next = { ...current }; delete next[card.id]; return next; }); return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController(); controllerRef.current = controller;
    setReading(card.id); setError(""); setMutationError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/cardkeys/${encodeURIComponent(card.id)}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "读取失败");
      if (controller.signal.aborted) return;
      if (edit) { setEditing(result.card); setDialogError(""); setShowPassword(false); }
      else setRevealed(current => ({ ...current, [card.id]: result.card.content }));
    } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "读取失败"); }
    finally { if (!controller.signal.aborted) setReading(""); }
  }

  async function mutate() {
    const card = editing || deleting;
    if (!card || saving) return;
    setSaving(true); setDialogError("");
    try {
      const response = await fetch(`/api/admin/cardkeys/${encodeURIComponent(card.id)}`, {
        method: editing ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { content: editing.content, batchNo: editing.batchNo, updatedAt: editing.updatedAt } : { updatedAt: card.updatedAt }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 || response.status === 404) { setEditing(null); setDeleting(null); setRefresh(current => current + 1); setMutationError(result.error); onChanged(); return; }
        throw new Error(result.error || "操作失败");
      }
      setMessage(editing ? "卡密已更新" : "卡密已删除，库存已更新");
      setEditing(null); setDeleting(null); setRevealed({}); setRefresh(current => current + 1); onChanged();
    } catch (err) { setDialogError(err instanceof Error ? err.message : "操作失败"); }
    finally { setSaving(false); }
  }

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / (data?.pageSize || 20)));
  return (
    <section className="mt-8 rounded-xl bg-white p-6 shadow-sm" aria-labelledby="inventory-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 id="inventory-title" className="text-lg font-bold text-gray-800">未售出卡密</h2><p className="mt-1 text-sm text-gray-500">默认隐藏内容；可用和未关联订单的失效卡密支持编辑、删除。</p></div>
        <button type="button" onClick={() => { setMessage(""); setRefresh(current => current + 1); }} className="rounded-lg border px-4 py-2 text-sm hover:bg-gray-50">刷新列表</button>
      </div>
      <div className="my-5 flex flex-wrap gap-2" aria-label="卡密状态筛选">
        {(["AVAILABLE", "LOCKED", "INVALID", "ALL"] as const).map(status => <button type="button" key={status} aria-pressed={filter === status} onClick={() => { setFilter(status); setPage(1); setMessage(""); }} className={`rounded-lg px-4 py-2 text-sm ${filter === status ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{status === "ALL" ? "全部未售出" : labels[status]}</button>)}
      </div>
      {(error || mutationError) && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error || mutationError}</p>}
      {message && <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}
      {loading ? <p role="status" className="py-10 text-center text-gray-500">正在加载卡密...</p> : !data?.cards.length ? <p className="py-10 text-center text-gray-500">{error ? "无法加载，请刷新重试" : "当前筛选下暂无卡密"}</p> : <div className="divide-y">
        {data.cards.map(card => <article key={card.id} className="py-4 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm"><span className={`rounded-full px-2 py-1 text-xs ${colors[card.status]}`}>{labels[card.status]}</span><span className="text-gray-600">批次：{card.batchNo || "未设置"}</span><time className="text-xs text-gray-400">{new Date(card.createdAt).toLocaleString("zh-CN")}</time></div>
            {card.canManage ? <div className="flex shrink-0 items-center gap-4 text-sm">
              <button type="button" disabled={Boolean(reading)} onClick={() => readCard(card)} className="inline-flex items-center gap-1 text-gray-600 hover:text-primary disabled:opacity-50">{Object.hasOwn(revealed, card.id) ? <EyeOff size={15} /> : <Eye size={15} />}{reading === card.id ? "读取中..." : Object.hasOwn(revealed, card.id) ? "隐藏" : "查看"}</button>
              <button type="button" disabled={Boolean(reading)} onClick={() => readCard(card, true)} className="text-primary disabled:opacity-50">编辑</button>
              <button type="button" onClick={() => { triggerRef.current = document.activeElement as HTMLElement; setDeleting(card); setDialogError(""); }} className="text-red-600 hover:text-red-700">删除</button>
            </div> : <span className="text-xs text-gray-400">已关联订单，不可修改</span>}
          </div>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 font-mono text-sm break-all">{revealed[card.id] ?? "••••••••••••••••"}</div>
        </article>)}
      </div>}
      {data && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-gray-500"><span>共 {data.total} 条 · 第 {page} / {totalPages} 页</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">上一页</button><button type="button" disabled={page >= totalPages || loading} onClick={() => setPage(current => current + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">下一页</button></div></div>}

      <dialog ref={dialogRef} aria-labelledby="card-dialog-title" onCancel={event => { event.preventDefault(); closeDialog(); }} className="w-[calc(100%_-_2rem)] max-w-lg rounded-2xl p-6 shadow-xl backdrop:bg-black/40">
        <div className="mb-5 flex items-center justify-between"><h3 id="card-dialog-title" className="text-lg font-semibold">{editing ? "编辑卡密" : "删除卡密"}</h3><button type="button" onClick={closeDialog} disabled={saving} aria-label="关闭" className="text-gray-400"><X size={20} /></button></div>
        {dialogError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{dialogError}</p>}
        {editing ? <form onSubmit={event => { event.preventDefault(); void mutate(); }} autoComplete="off">
          <label htmlFor="edit-card-content" className="block text-sm text-gray-600">卡密内容</label>
          <div className="mt-2 flex gap-2"><input id="edit-card-content" name="inventory-card-content" type={showPassword || supportsTextMask ? "text" : "password"} value={editing.content} onChange={event => setEditing(current => current && ({ ...current, content: event.target.value }))} maxLength={10000} autoComplete="off" data-lpignore="true" data-1p-ignore="true" disabled={saving} required className={`min-w-0 flex-1 rounded-lg border px-3 py-2 font-mono text-sm ${supportsTextMask && !showPassword ? "order-query-masked" : ""}`} /><button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? "隐藏卡密" : "显示卡密"} className="rounded-lg border px-3">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <label htmlFor="edit-card-batch" className="mb-2 mt-4 block text-sm text-gray-600">批次号（可选）</label><input id="edit-card-batch" value={editing.batchNo} onChange={event => setEditing(current => current && ({ ...current, batchNo: event.target.value }))} disabled={saving} maxLength={100} className="w-full rounded-lg border px-3 py-2 text-sm" />
          <p className="mt-3 text-xs text-gray-500">每次编辑一条卡密；若已被订单占用，保存时会拒绝修改。</p>
          <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={saving} onClick={closeDialog} className="rounded-lg border px-4 py-2 text-sm">取消</button><button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "保存中..." : "保存修改"}</button></div>
        </form> : <><p className="text-sm leading-6 text-gray-600">确定删除这条卡密？删除后无法恢复，商品可用库存会同步更新。</p><div className="mt-6 flex justify-end gap-3"><button type="button" disabled={saving} onClick={closeDialog} className="rounded-lg border px-4 py-2 text-sm">取消</button><button type="button" disabled={saving} onClick={() => mutate()} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "删除中..." : "确认删除"}</button></div></>}
      </dialog>
    </section>
  );
}
