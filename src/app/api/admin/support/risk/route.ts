import { z } from 'zod';
import { getAdminSession, hasAdminPermission } from '@/lib/admin-auth';
import { orderJson, orderError } from '@/lib/order-http';
import { readBoundedJson } from '@/lib/request-body';
import { blockSchema, riskQuerySchema, createSupportBlock, listSupportRisk, revokeSupportBlock } from '@/lib/support/admin';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const admin=await getAdminSession();
  if(!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try {return orderJson(await listSupportRisk(riskQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))));}
  catch(error) {return orderError('Support risk',error);}
}
export async function POST(request:Request) {
  const admin=await getAdminSession();
  if(!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try {
    const input=z.discriminatedUnion('action',[blockSchema,z.object({action:z.literal('revoke'),id:z.string().min(1).max(100)}).strict()]).parse(await readBoundedJson(request,4096));
    if(input.action==='revoke') await revokeSupportBlock(input.id,admin.id);else await createSupportBlock(input,admin.id);
    return orderJson({success:true});
  } catch(error) {return orderError('Support risk update',error);}
}
