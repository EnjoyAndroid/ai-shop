import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { orderError, orderJson } from "@/lib/order-http";
import { readBoundedJson } from "@/lib/request-body";

export const dynamic = "force-dynamic";
const articleSchema = z.object({ id: z.string().trim().min(1).max(80).optional(), title: z.string().trim().min(1).max(120), question: z.string().trim().min(1).max(300), aliases: z.array(z.string().trim().min(1).max(100)).max(30).default([]), keywords: z.array(z.string().trim().min(1).max(50)).max(50).default([]), category: z.string().trim().min(1).max(50).default("general"), content: z.string().trim().min(1).max(20000), action: z.enum(["save", "publish"]).default("save") }).strict();

async function admin() { const value = await getAdminSession(); return value && hasAdminPermission(value, "settings") ? value : null; }

export async function GET() {
  if (!await admin()) return orderJson({ error: "无权限" }, 403);
  try { return orderJson({ articles: await prisma.supportArticle.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }], select: { id: true, title: true, question: true, aliases: true, keywords: true, category: true, content: true, status: true, version: true, publishedAt: true, updatedAt: true } }) }); }
  catch (error) { return orderError("List support knowledge", error); }
}

export async function POST(request: NextRequest) {
  if (!await admin()) return orderJson({ error: "无权限" }, 403);
  try {
    const body = articleSchema.parse(await readBoundedJson(request, 32 * 1024));
    const status = body.action === "publish" ? "PUBLISHED" : "DRAFT";
    const base = { title: body.title, question: body.question, aliases: body.aliases, keywords: body.keywords, category: body.category, content: body.content, status } as const;
    const article = body.id
      ? await prisma.supportArticle.update({ where: { id: body.id }, data: { ...base, ...(status === "PUBLISHED" ? { publishedAt: new Date(), version: { increment: 1 } } : {}) }, select: { id: true, status: true, version: true } })
      : await prisma.supportArticle.create({ data: { ...base, ...(status === "PUBLISHED" ? { publishedAt: new Date() } : {}) }, select: { id: true, status: true, version: true } });
    return orderJson({ article });
  } catch (error) { return orderError("Save support knowledge", error); }
}

