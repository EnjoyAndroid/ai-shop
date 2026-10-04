"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HeaderClient } from "@/components/shop/header-client";
import { ContactSupport } from "@/components/shop/contact-support";
import { OrderDialog } from "@/components/shop/order-dialog";
import { PasswordInput } from "@/components/ui/password-input";
import { orderFilterSchema, orderPasswordSchema, type OrderFilter, type OrderSearchResult, type OrderSummary } from "@/lib/order-rules";
import { getOrderStatusInfo } from "@/lib/order-status";
import { saveOrderAccess, saveOrderReturnUrl, orderResultsUrl } from "@/lib/order-client";

const filters: { value: OrderFilter; label: string }[] = [
  { value: "ALL", label: "全部" }, { value: "PENDING", label: "待付款" },
  { value: "PAID", label: "已支付" }, { value: "REFUNDED", label: "已退款" },
];

function OrderResultsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const ticket = params.get("ticket") || "";
  const parsedFilter = orderFilterSchema.safeParse(params.get("status") || "ALL");
  const filter: OrderFilter = parsedFilter.success ? parsedFilter.data : "ALL";
  const requestedPage = Number(params.get("page") || "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const [result, setResult] = useState<OrderSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<OrderSummary | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [retry, setRetry] = useState(0);
  const requestVersion = useRef(0);
  const returnUrl = orderResultsUrl(ticket, filter, page);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setLoading(true);
    setSelected(null);
    setPassword("");
    requestVersion.current++;
    if (!/^[a-f0-9]{64}$/.test(ticket)) {
      router.replace("/order?expired=1");
      return () => controller.abort();
    }
    const load = async () => {
      try {
        const response = await fetch("/api/orders/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queryToken: ticket, status: filter, page }), signal: controller.signal,
        });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.code === "QUERY_EXPIRED") { router.replace("/order?expired=1"); return; }
        if (!response.ok) throw new Error(data.error || "查询失败，请重试");
        setResult(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "查询失败，请重试");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => { controller.abort(); requestVersion.current++; };
  }, [ticket, filter, page, retry, router]);

  const closePassword = () => { requestVersion.current++; setSelected(null); setPassword(""); setPasswordError(""); setUnlocking(false); };
  const openDetails = (order: OrderSummary) => { setSelected(order); setPassword(""); setPasswordError(""); };
  const unlock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !result) return;
    const validation = orderPasswordSchema.safeParse(password);
    if (!validation.success) { setPasswordError(validation.error.issues[0].message); return; }
    const version = ++requestVersion.current;
    setUnlocking(true);
    setPasswordError("");
    try {
      const response = await fetch(`/api/orders/${selected.orderNo}/unlock`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryToken: ticket, password }),
      });
      const data = await response.json();
      if (version !== requestVersion.current) return;
      if (data.code === "QUERY_EXPIRED") { closePassword(); router.replace("/order?expired=1"); return; }
      if (!response.ok) throw new Error(data.error || "验证失败，请重试");
      saveOrderAccess(selected.orderNo, data.accessToken);
      saveOrderReturnUrl(selected.orderNo, returnUrl);
      setPassword("");
      router.push(`/order/${selected.orderNo}`);
      setSelected(null);
    } catch (err) { if (version === requestVersion.current) setPasswordError(err instanceof Error ? err.message : "验证失败，请重试"); }
    finally { if (version === requestVersion.current) setUnlocking(false); }
  };
  const changePage = (status: OrderFilter, nextPage: number) => router.push(orderResultsUrl(ticket, status, nextPage));
  const productNames = (order: OrderSummary) => order.items.map(item => item.productName).join("、");
  const quantity = (order: OrderSummary) => order.items.reduce((sum, item) => sum + item.quantity, 0);
  const date = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });
  const badge = (status: string) => {
    const info = getOrderStatusInfo(status);
    return <span className={`inline-block whitespace-nowrap rounded px-2 py-1 text-xs ${info.color}`}>{info.text}</span>;
  };
  const detailsButton = (order: OrderSummary) => <button type="button" disabled={loading} onClick={() => openDetails(order)} className="whitespace-nowrap text-primary hover:underline disabled:opacity-50">订单详情</button>;

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderClient />
      <main className="container mx-auto px-4 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto mb-5"><Link href="/order" className="text-sm text-primary hover:underline">← 返回订单查询</Link></div>
        {loading && <div role="status" className="max-w-6xl mx-auto rounded-xl bg-white p-12 text-center text-gray-500">正在加载订单列表…</div>}
        {error && <div className="max-w-6xl mx-auto rounded-xl bg-white p-8 text-center"><p role="alert" className="text-red-600 mb-4">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="text-primary hover:underline">重新加载</button></div>}
        {result && <section aria-label="订单列表" aria-busy={loading} className="max-w-6xl mx-auto bg-white rounded-xl p-4 sm:p-6">
          <div className="flex justify-between items-center mb-5"><h2 className="font-semibold text-gray-800">订单列表</h2><span className="text-sm text-gray-500">共 {result.total} 笔</span></div>
          <div className="flex gap-6 border-b mb-4">
            {filters.map(tab => <button key={tab.value} type="button" disabled={loading} onClick={() => changePage(tab.value, 1)}
              className={`pb-3 text-sm border-b-2 disabled:opacity-50 ${filter === tab.value ? "text-primary border-primary font-medium" : "text-gray-500 border-transparent"}`}>{tab.label}</button>)}
          </div>
          {result.orders.length === 0 ? <div className="py-14 text-center text-gray-500">没有找到符合条件的订单</div> : <>
            <table className="hidden md:table w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-700"><tr>{["商品", "订单号", "金额", "状态", "操作"].map(label => <th key={label} className="px-4 py-4 font-medium">{label}</th>)}</tr></thead>
              <tbody>{result.orders.map(order => <tr key={order.orderNo} className="border-b last:border-0">
                <td className="p-4 max-w-xs"><p className="line-clamp-2 text-gray-700" title={productNames(order)}>{productNames(order)}</p><p className="text-xs text-gray-400 mt-2">{date(order.createdAt)}</p></td>
                <td className="p-4 font-mono text-xs text-gray-600 whitespace-nowrap">{order.orderNo}</td>
                <td className="p-4 whitespace-nowrap"><p className="font-semibold text-red-500">¥{(order.payAmount / 100).toFixed(2)}</p><p className="text-xs text-gray-400 mt-2">共 {quantity(order)} 件</p></td>
                <td className="p-4">{badge(order.status)}</td><td className="p-4">{detailsButton(order)}</td>
              </tr>)}</tbody>
            </table>
            <div className="md:hidden divide-y">{result.orders.map(order => <article key={order.orderNo} className="py-5 first:pt-2">
              <div className="flex justify-between gap-3"><h3 className="font-medium text-gray-800 break-words">{productNames(order)}</h3><div>{badge(order.status)}</div></div>
              <p className="text-xs font-mono text-gray-500 break-all mt-3">{order.orderNo}</p>
              <p className="text-xs text-gray-400 mt-2">{date(order.createdAt)}</p>
              <div className="flex justify-between items-center mt-4 text-sm"><p><span className="font-semibold text-red-500">¥{(order.payAmount / 100).toFixed(2)}</span><span className="text-gray-400 ml-3">共 {quantity(order)} 件</span></p>{detailsButton(order)}</div>
            </article>)}</div>
          </>}
          <div className="flex items-center justify-end gap-4 pt-5 text-sm">
            <button type="button" disabled={loading || result.page <= 1} onClick={() => changePage(filter, result.page - 1)} className="text-primary disabled:text-gray-300">上一页</button>
            <span className="text-gray-600">{result.page} / {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>
            <button type="button" disabled={loading || result.page * result.pageSize >= result.total} onClick={() => changePage(filter, result.page + 1)} className="text-primary disabled:text-gray-300">下一页</button>
          </div>
        </section>}
        <div className="max-w-3xl mx-auto mt-8"><ContactSupport /></div>
      </main>
      {selected && <OrderDialog title="订单安全验证" onClose={closePassword}>
        <form onSubmit={unlock}>
          <div className="p-6 space-y-4">
            <p className="text-xs font-mono text-gray-500 break-all">{selected.orderNo}</p>
            <div><label htmlFor="order-unlock-code" className="block text-sm text-gray-700 mb-2">订单查询密码 <span className="text-red-500">*</span></label>
              <PasswordInput id="order-unlock-code" name="orderLookupCode" value={password} onChange={event => setPassword(event.target.value)} required minLength={8}
                avoidPasswordManager placeholder="请输入下单时设置的查询密码" className="px-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50" /></div>
            {passwordError && <p role="alert" className="text-sm text-red-600">{passwordError}</p>}
          </div>
          <div className="border-t p-4 flex justify-end gap-3"><button type="button" onClick={closePassword} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-600">取消</button><button type="submit" disabled={unlocking} className="px-4 py-2 rounded-lg bg-primary text-white disabled:opacity-50">{unlocking ? "验证中…" : "查看详情"}</button></div>
        </form>
      </OrderDialog>}
    </div>
  );
}

export function OrderResultsClient() {
  return <Suspense fallback={<div className="p-12 text-center text-gray-500">正在加载订单列表…</div>}><OrderResultsContent /></Suspense>;
}
