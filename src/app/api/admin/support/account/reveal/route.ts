import { z } from 'zod';
import { getAdminSession, hasAdminPermission } from '@/lib/admin-auth';
import { orderJson, orderError, limitOrderRequest } from '@/lib/order-http';
import { readBoundedJson } from '@/lib/request-body';
import { revealSupportAccount } from '@/lib/support/admin';

export const dynamic = 'force-dynamic';
export async function POST(request:Request) {
  const admin = await getAdminSession();
  if (!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try {
    const {turnId} = z.object({turnId:z.string().min(1).max(100)}).strict().parse(await readBoundedJson(request,1024));
    await limitOrderRequest('support-account-reveal',admin.id,30,60);
    return orderJson(await revealSupportAccount(turnId,admin.id));
  } catch (error) { return orderError('Support account reveal',error); }
}
