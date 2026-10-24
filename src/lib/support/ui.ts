import { z } from 'zod';
import { qrImageUrlSchema } from '@/lib/qr-settings';
import { getPublicContactSettings } from '@/lib/contact-settings';

export const supportPages = {
  products: { label: '浏览商品', href: '/' },
  order_query: { label: '查询订单', href: '/order' },
  my_orders: { label: '我的订单', href: '/orders' },
  login: { label: '登录账号', href: '/login' },
  register: { label: '注册账号', href: '/register' },
  reset_password: { label: '找回密码', href: '/forgot-password' },
  balance: { label: '账户余额', href: '/balance' },
  recharge: { label: '余额充值', href: '/balance/recharge' },
} as const;
export type SupportPage = keyof typeof supportPages;
export interface SupportUiLink { label: string; href: string; }
export interface SupportUiImage { alt: string; url: string; }
export interface SupportUi { links: SupportUiLink[]; images: SupportUiImage[]; }
export interface SupportEvidence { tool: string; result: unknown; }
export const emptySupportUi = (): SupportUi => ({ links: [], images: [] });

export function isSupportPath(value: string): boolean {
  if (Object.values(supportPages).some(page => page.href === value)) return true;
  if (!value.startsWith('/product/')) return false;
  try {
    const slug = decodeURIComponent(value.slice(9));
    return Boolean(slug) && !/[\\/\u0000-\u0020?#]/.test(slug) && slug !== '.' && slug !== '..'
      && value === `/product/${encodeURIComponent(slug)}`;
  } catch { return false; }
}
const uiSchema = z.object({
  links: z.array(z.object({ label: z.string().min(1).max(180), href: z.string().refine(isSupportPath) }).strict()).max(8),
  images: z.array(z.object({ alt: z.literal('微信客服二维码'), url: qrImageUrlSchema.refine(Boolean) }).strict()).max(1),
}).strict();
export function readSupportUi(value: unknown): SupportUi {
  const parsed = uiSchema.safeParse(value);
  return parsed.success ? parsed.data : emptySupportUi();
}

/** Only successful server tools can populate attachments; never parse model-supplied URLs. */
export function buildSupportUi(evidence: SupportEvidence[], answer: string, userId?: string): SupportUi {
  const ui = emptySupportUi();
  const addLink = (label: string, href: string) => {
    if (isSupportPath(href) && ui.links.length < 8 && !ui.links.some(link => link.href === href)) ui.links.push({ label: label.slice(0,180), href });
  };
  for (const entry of evidence) {
    const result = entry.result as any;
    if (!result || typeof result !== 'object' || result.error) continue;
    if (entry.tool === 'get_contacts') {
      const contact = getPublicContactSettings(result);
      // Latest successful contact query in this turn wins, including removal.
      ui.images = contact.wechatSupportQrUrl ? [{ alt: '微信客服二维码', url: contact.wechatSupportQrUrl }] : [];
    }
    if (entry.tool === 'search_products') {
      const products = [...(Array.isArray(result.exactMatches) ? result.exactMatches : []), ...(Array.isArray(result.relatedProducts) ? result.relatedProducts : [])]
        .filter(p => typeof p?.name === 'string' && typeof p?.url === 'string');
      const mentioned = products.filter(p => answer.includes(p.name));
      for (const p of (mentioned.length ? mentioned : products).slice(0, 6)) addLink(`查看 ${p.name}`, p.url);
    }
    if (entry.tool === 'get_my_orders') {
      const page = supportPages[userId ? 'my_orders' : 'order_query']; addLink(page.label, page.href);
    }
    if (entry.tool === 'get_navigation' && typeof result.page === 'string' && Object.hasOwn(supportPages, result.page)) {
      const page = supportPages[result.page as SupportPage]; addLink(page.label, page.href);
    }
  }
  return readSupportUi(ui);
}

/** Presentation URLs belong to the UI, not the model's prose or conversational memory. */
export function modelToolResult(tool: string, result: any): unknown {
  if (tool === 'get_contacts') {
    const contacts = getPublicContactSettings(result);
    return { queriedAt: result.queriedAt, wechatQrConfigured: Boolean(contacts.wechatSupportQrUrl),
      wechatSupportText: contacts.wechatSupportText, telegramUrl: contacts.telegramUrl,
      presentation: contacts.wechatSupportQrUrl ? '回答下方会自动显示微信客服二维码图片，请引导扫码，不输出图片链接或Markdown。' : '未配置微信二维码，不要声称显示图片。' };
  }
  if (tool === 'search_products') return { ...result,
    exactMatches: result.exactMatches.map(({ url: _url, ...p }: any) => p),
    relatedProducts: result.relatedProducts.map(({ url: _url, ...p }: any) => p),
    presentation: '已查询商品由前端显示详情按钮，回答使用商品名称，不编写链接。' };
  if (tool === 'get_navigation') return { page: result.page, label: result.label, presentation: '该站内页面按钮会显示在答案下方。' };
  return result;
}
export function cleanSupportAnswer(text: string, ui: SupportUi): string {
  let result = text;
  for (const image of ui.images) {
    const escaped = image.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`!?\\[[^\\]]*\\]\\(\\s*${escaped}\\s*\\)`, 'g'), '微信客服二维码见下方')
      .replaceAll(image.url, '微信客服二维码见下方');
  }
  // Render only server-approved paths as buttons; leave prose as React text.
  result = result.replace(/\[([^\]]+)\]\(\s*(\/[^\s)]+)\s*\)/g, (whole, label, path) => ui.links.some(link => link.href === path) ? label : whole);
  // The widget renders answer text as plain text, so remove common Markdown
  // emphasis markers instead of showing model formatting characters.
  result = result.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1').replace(/`([^`\n]+)`/g, '$1');
  return result;
}
