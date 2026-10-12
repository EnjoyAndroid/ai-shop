import { createHash } from "crypto";
import { z } from "zod";
import prisma from "./db";

export const resetTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const grantSchema = z.object({ userId: z.string().min(1), sessionVersion: z.number().int().nonnegative() }).strict();
export type ResetGrant = z.infer<typeof grantSchema>;

// Versioned namespace invalidates legacy grants that did not bind account state.
export function resetTokenKey(token: string): string {
  return `reset_password:v2:${createHash("sha256").update(token).digest("hex")}`;
}

export function parseResetGrant(raw: string | null): ResetGrant | null {
  if (!raw) return null;
  try {
    const result = grantSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch { return null; }
}

export async function isResetGrantCurrent(grant: ResetGrant): Promise<boolean> {
  return Boolean(await prisma.user.findFirst({
    where: { id: grant.userId, status: "ACTIVE", sessionVersion: grant.sessionVersion },
    select: { id: true },
  }));
}
