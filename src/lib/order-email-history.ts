import { orderEmailSchema } from "./order-rules";

export const ORDER_EMAIL_HISTORY_KEY = "order-email-history:v1";
const MAX_EMAILS = 3;

function normalizeHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const emails: string[] = [];
  for (const item of value) {
    const parsed = orderEmailSchema.safeParse(item);
    if (parsed.success && !emails.includes(parsed.data)) emails.push(parsed.data);
    if (emails.length === MAX_EMAILS) break;
  }
  return emails;
}

export function readOrderEmailHistory(): string[] {
  try {
    return normalizeHistory(JSON.parse(localStorage.getItem(ORDER_EMAIL_HISTORY_KEY) || "[]"));
  } catch { return []; }
}

// Called only after a successful search response. Order numbers never enter storage.
export function rememberOrderEmail(keyword: string): string[] {
  const history = readOrderEmailHistory();
  const email = orderEmailSchema.safeParse(keyword);
  if (!email.success) return history;
  const next = [email.data, ...history.filter(item => item !== email.data)].slice(0, MAX_EMAILS);
  try { localStorage.setItem(ORDER_EMAIL_HISTORY_KEY, JSON.stringify(next)); }
  catch { return history; }
  return next;
}

export function removeOrderEmail(email: string): string[] {
  const next = readOrderEmailHistory().filter(item => item !== email);
  try {
    if (next.length) localStorage.setItem(ORDER_EMAIL_HISTORY_KEY, JSON.stringify(next));
    else localStorage.removeItem(ORDER_EMAIL_HISTORY_KEY);
  } catch { /* Keep the current page usable if browser storage is unavailable. */ }
  return next;
}
