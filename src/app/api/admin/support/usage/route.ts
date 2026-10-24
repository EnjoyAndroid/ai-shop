import { getAdminSession, hasAdminPermission } from '@/lib/admin-auth';
import { orderJson, orderError } from '@/lib/order-http';
import { supportUsageSummary, usageQuerySchema } from '@/lib/support/admin';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const admin=await getAdminSession();
  if(!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try { return orderJson(await supportUsageSummary(usageQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)))); }
  catch(error) { return orderError('Support usage',error); }
}
