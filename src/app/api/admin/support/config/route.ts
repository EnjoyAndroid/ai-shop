import { z } from 'zod';
import prisma from '@/lib/db';
import { getAdminSession, hasAdminPermission } from '@/lib/admin-auth';
import { orderError, orderJson, OrderRequestError } from '@/lib/order-http';
import { readBoundedJson } from '@/lib/request-body';
import { dayStartShanghai, getSupportConfig, supportModelConfigured, supportPolicy } from '@/lib/support/config';
import { currentSupportBudget } from '@/lib/support/budget';
import { clearSettingsCache } from '@/lib/services/settings.service';
import { Prisma } from '@prisma/client';
import { getSupportPolicy, SUPPORT_CONFIG_LOCK } from '@/lib/support/policy-store';
import { supportLimitSnapshot } from '@/lib/support/limits';
export const dynamic='force-dynamic';
const integerSetting=(min:number,max:number)=>z.number().int().min(min).max(max);
const schema=z.object({
  dailyBudgetCny:z.number().finite().min(0).max(100000).refine(n=>Math.abs(n*100-Math.round(n*100))<1e-6,'预算最多两位小数').optional(),
  detailRetentionDays:integerSetting(1,365).optional(), usageRetentionDays:integerSetting(1,730).optional(),
  guestDailyModelTurns:integerSetting(1,10000).optional(), memberDailyModelTurns:integerSetting(1,10000).optional(),
  guestPerMinute:integerSetting(1,1000).optional(), memberPerMinute:integerSetting(1,1000).optional(),
}).strict().refine(value=>Object.keys(value).length>0,'至少修改一项配置');
export async function GET() {
  const admin=await getAdminSession();
  if(!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try {
    const c={...await getSupportConfig(),...await getSupportPolicy()}, limits=supportLimitSnapshot();return orderJson({provider:c.provider,model:c.model,dailyBudgetCny:await currentSupportBudget(c.dailyBudgetCny),configured:supportModelConfigured(c),apiKeyConfigured:Boolean(c.apiKey),detailRetentionDays:c.detailRetentionDays,usageRetentionDays:c.usageRetentionDays,guestDailyModelTurns:c.guestDailyModelTurns,memberDailyModelTurns:c.memberDailyModelTurns,guestPerMinute:c.guestPerMinute,memberPerMinute:c.memberPerMinute,fixedLimits:{plannerMaxOutputTokens:limits.plannerMaxOutputTokens,answerMaxOutputTokens:limits.answerMaxOutputTokens,upstreamTimeoutMs:limits.upstreamTimeoutMs,totalTimeoutMs:limits.totalTimeoutMs,maxModelRounds:limits.maxModelRounds,maxToolCalls:limits.maxToolCalls,identityConcurrent:limits.identityConcurrent,ipConcurrent:limits.ipConcurrent,globalConcurrent:limits.globalConcurrent,duplicateWindowSeconds:limits.duplicateWindowSeconds,duplicateThreshold:limits.duplicateThreshold,cooldownSeconds:limits.cooldownSeconds}});
  } catch(e) {return orderError('Support config',e);}
}
export async function POST(request:Request) {
  const admin=await getAdminSession();
  if(!admin || !hasAdminPermission(admin,'settings')) return orderJson({error:'无权限'},403);
  try {
    const body=schema.parse(await readBoundedJson(request,4096));
    await prisma.$transaction(async tx=>{
      // Serialize partial updates so two administrators cannot create conflicting retention windows.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPPORT_CONFIG_LOCK})`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-budget:${dayStartShanghai().toISOString()}`}))`;
      const saved=await tx.systemSetting.findMany({where:{key:{in:['supportDetailRetentionDays','supportUsageRetentionDays']}}});
      const current=supportPolicy(Object.fromEntries(saved.map(row=>[row.key,row.value])));
      if ((body.usageRetentionDays ?? current.usageRetentionDays) < (body.detailRetentionDays ?? current.detailRetentionDays)) {
        throw new OrderRequestError('用量记录保留天数不能少于问答和身份/IP明细保留天数',400);
      }
      const keys:Record<string,string>={dailyBudgetCny:'supportDailyBudgetCny',detailRetentionDays:'supportDetailRetentionDays',usageRetentionDays:'supportUsageRetentionDays',guestDailyModelTurns:'supportGuestDailyModelTurns',memberDailyModelTurns:'supportMemberDailyModelTurns',guestPerMinute:'supportGuestPerMinute',memberPerMinute:'supportMemberPerMinute'};
      const changes:Record<string,Prisma.InputJsonValue>={};
      for (const [field,key] of Object.entries(keys)) if (body[field as keyof typeof body] !== undefined) {
        const value=body[field as keyof typeof body]!; const prior=await tx.systemSetting.findUnique({where:{key}});
        await tx.systemSetting.upsert({where:{key},create:{key,value:String(value)},update:{value:String(value)}});
        changes[field]={previous:prior?.value??'默认值',value};
      }
      await tx.supportRiskEvent.create({data:{category:'ADMIN_SUPPORT_CONFIG',details:{adminId:admin.id,changes}}});
    });
    await clearSettingsCache();return orderJson({success:true});
  } catch(e) {return orderError('Save support config',e);}
}
