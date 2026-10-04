import type { OrderFilter } from "./order-rules";

export function orderResultsUrl(ticket: string, status: OrderFilter = "ALL", page = 1) {
  const params = new URLSearchParams({ ticket });
  if (status !== "ALL") params.set("status", status);
  if (page !== 1) params.set("page", String(page));
  return `/order/results?${params.toString()}`;
}

export function saveOrderReturnUrl(orderNo: string, url: string) {
  try { sessionStorage.setItem(`order-return:${orderNo}`, url); } catch { /* Storage is optional. */ }
}

export function orderReturnUrl(orderNo: string) {
  if (orderNo.startsWith("R")) return "/orders";
  try {
    const saved = sessionStorage.getItem(`order-return:${orderNo}`);
    if (saved && /^\/order\/results\?ticket=[a-f0-9]{64}(?:&status=(?:PENDING|PAID|REFUNDED))?(?:&page=\d+)?$/.test(saved)) return saved;
  } catch { /* Storage is optional. */ }
  return "/order";
}

// Only short-lived access grants are stored, never the user's password.
export function saveOrderAccess(orderNo: string, token: string) {
  try { sessionStorage.setItem(`order-access:${orderNo}`, token); } catch { /* The query flow remains available when storage is disabled. */ }
}

export function orderAccessHeaders(orderNo: string): HeadersInit {
  try {
    const token = sessionStorage.getItem(`order-access:${orderNo}`);
    return token ? { "x-order-access-token": token } : {};
  } catch { return {}; }
}

export function orderAccessUrl(orderNo: string) {
  return orderNo.startsWith("R") ? "/login" : `/order?orderNo=${encodeURIComponent(orderNo)}`;
}
