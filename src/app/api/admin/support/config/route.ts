import { z } from 'zod';
import prisma from '@/lib/db';
import { getAdminSession, hasAdminPermission } from '@/lib/admin-auth';
import { orderError, orderJson } from '@/lib/order-http';
import { readBoundedJson } from '@/lib/request-body';
import { getSupportConfig, supportModelConfigured } from '@/lib/support/config';
import { currentSupportBudget } from '@/lib/support/budget';
import { clearSettingsCache } from '@/lib/services/settings.service';
export const dynamic='force-dynamic';
const schema=z.object({dailyBudgetCny:z.number().finite().min(0).max(100000).refine(n=>Math.abs(n*100-Math.round(n*100))<1e-6,'预算最多两位小数')}).strict();
export async function GET() {
  const admin=await getAdminSession();
  if(!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try {
    const c=await getSupportConfig();return orderJson({provider:c.provider,model:c.model,dailyBudgetCny:await currentSupportBudget(c.dailyBudgetCny),configured:supportModelConfigured(c),apiKeyConfigured:Boolean(c.apiKey)});
  } catch(e) {return orderError('Support config',e);}
}
export async function POST(request:Request) {
  const admin=await getAdminSession();
  if(!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try {
    const body=schema.parse(await readBoundedJson(request,4096));
    await prisma.$transaction(async tx=>{
      const prior=await tx.systemSetting.findUnique({where:{key:'supportDailyBudgetCny'}});
      await tx.systemSetting.upsert({where:{key:'supportDailyBudgetCny'},create:{key:'supportDailyBudgetCny',value:String(body.dailyBudgetCny)},update:{value:String(body.dailyBudgetCny)}});
      await tx.supportRiskEvent.create({data:{category:'ADMIN_BUDGET',details:{adminId:admin.id,previous:prior?.value??'environment default',value:body.dailyBudgetCny}}});
    });
    await clearSettingsCache();return orderJson({success:true});
  } catch(e) {return orderError('Save support config',e);}
}
