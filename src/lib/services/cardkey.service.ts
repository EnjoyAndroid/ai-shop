import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/db";
import redis, { CACHE_KEYS } from "@/lib/redis";
import { encrypt } from "@/lib/encryption";
import { decryptCardKey } from "./product.service";
import { transaction } from "@/lib/transaction";
import { OrderRequestError } from "@/lib/order-errors";
import { logError } from "@/lib/logger";

const listSchema = z.object({
  productId: z.string().min(1, "请选择商品").max(100),
  status: z.enum(["ALL", "AVAILABLE", "LOCKED", "INVALID"]).default("AVAILABLE"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();
const versionSchema = z.string().datetime({ offset: true });
export const editCardKeySchema = z.object({
  content: z.string().trim().min(1, "请输入卡密").max(10000, "单条卡密最多10000个字符").refine(value => !/[\r\n]/.test(value), "一次只能编辑一条卡密，请勿输入换行"),
  batchNo: z.string().trim().max(100, "批次号最多100个字符"),
  updatedAt: versionSchema,
}).strict();
const deleteSchema = z.object({ updatedAt: versionSchema }).strict();
const metadataSelect = { id: true, status: true, batchNo: true, createdAt: true, updatedAt: true, orderId: true, soldAt: true } satisfies Prisma.CardKeySelect;
type CardState = { status: string; orderId: string | null; soldAt: Date | null };
const canManage = (card: CardState) => ["AVAILABLE", "INVALID"].includes(card.status) && !card.orderId && !card.soldAt;
const conflict = () => new OrderRequestError("卡密已被订单占用、售出或修改，请刷新列表", 409);

export async function listUnsoldCardKeys(input: unknown) {
  const { productId, status, page } = listSchema.parse(input);
  const where: Prisma.CardKeyWhereInput = { productId, status: status === "ALL" ? { in: ["AVAILABLE", "LOCKED", "INVALID"] } : status };
  const pageSize = 20;
  const [cards, total] = await prisma.$transaction([
    prisma.cardKey.findMany({ where, select: metadataSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.cardKey.count({ where }),
  ]);
  return { cards: cards.map(({ orderId, soldAt, ...card }) => ({ ...card, canManage: canManage({ ...card, orderId, soldAt }) })), total, page, pageSize };
}

export async function readUnsoldCardKey(id: string) {
  const card = await prisma.cardKey.findUnique({ where: { id }, select: { ...metadataSelect, content: true, iv: true, tag: true } });
  if (!card) throw new OrderRequestError("卡密不存在", 404);
  if (!canManage(card)) throw conflict();
  return { id: card.id, content: decryptCardKey(card), batchNo: card.batchNo || "", updatedAt: card.updatedAt };
}

export async function changeUnsoldCardKey(id: string, input: unknown, action: "edit" | "delete") {
  const edit = action === "edit" ? editCardKeySchema.parse(input) : null;
  const parsed = edit || deleteSchema.parse(input);
  const encrypted = edit ? encrypt(edit.content) : undefined;
  const result = await transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "CardKey" WHERE id = ${id} FOR UPDATE`;
    const card = await tx.cardKey.findUnique({ where: { id }, select: { ...metadataSelect, productId: true, product: { select: { slug: true } } } });
    if (!card) throw new OrderRequestError("卡密不存在", 404);
    if (!canManage(card) || card.updatedAt.getTime() !== Date.parse(parsed.updatedAt)) throw conflict();
    if (edit && encrypted) {
      await tx.cardKey.update({ where: { id }, data: { ...encrypted, batchNo: edit.batchNo || null, updatedAt: new Date(Math.max(Date.now(), card.updatedAt.getTime() + 1)) } });
    } else {
      await tx.cardKey.delete({ where: { id } });
    }
    const stock = await tx.cardKey.count({ where: { productId: card.productId, status: "AVAILABLE" } });
    await tx.product.update({ where: { id: card.productId }, data: { stock } });
    return { stock, slug: card.product.slug };
  });
  try { await redis.del(CACHE_KEYS.PRODUCTS_LIST, CACHE_KEYS.PRODUCT(result.slug)); }
  catch (error) { logError("Card inventory cache", error); }
  return { success: true, stock: result.stock };
}
