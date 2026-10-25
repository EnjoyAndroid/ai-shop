import { getSupportPolicy } from './policy-store';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/db';
import { dayStartShanghai, redactSupportText } from './config';
import { riskHash } from './risk';
import { maskSupportAccount } from './account-mask';
import { OrderRequestError } from '@/lib/order-errors';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const usageQuerySchema = z.object({ from: date.optional(), to: date.optional(), page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25), view: z.enum(['turns','calls']).default('turns'), q: z.string().trim().max(100).default(''), turnId: z.string().trim().min(1).max(100).optional() }).strict();
export type SupportUsageQuery = z.input<typeof usageQuerySchema>;
export function usageWindow(query: SupportUsageQuery, now = new Date()) {
  const parsed = usageQuerySchema.parse(query);
  const start = parsed.from ? new Date(`${parsed.from}T00:00:00+08:00`) : new Date(dayStartShanghai(now).getTime()-6*86400000);
  const endDay = parsed.to ? new Date(`${parsed.to}T00:00:00+08:00`) : dayStartShanghai(now);
  const end = new Date(endDay.getTime()+86400000);
  const format = (d:Date) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end<=start || end.getTime()-start.getTime()>730*86400000
    || (parsed.from && format(start)!==parsed.from) || (parsed.to && format(endDay)!==parsed.to)) throw new z.ZodError([{ code:'custom', path:['from'], message:'请选择有效的日期范围，最多730天' }]);
  return { ...parsed, from:format(start), to:format(endDay), start, end };
}
const turnSelect = { id:true, requestId:true, conversationId:true, userText:true, answerText:true, status:true, createdAt:true,
  clientIp:true, clientIpTrusted:true, identityHash:true, modelTurn:true, latencyMs:true, clearedAt:true,
  conversation:{select:{userId:true,user:{select:{email:true,name:true}}}} } as const;
type Turn = Prisma.SupportTurnGetPayload<{select: typeof turnSelect}>;
function turnDto(t:Turn, detailRetentionDays = 90) {
  const { conversation, ...rest } = t;
  const expiresAt = new Date(t.createdAt.getTime()+detailRetentionDays*86400000);
  if (t.clearedAt || expiresAt.getTime() <= Date.now()) return {
    ...rest, userText:'[对话内容已按保留策略清理]', answerText:null,
    conversationId:'已清理', requestId:'已清理', userId:null, account:null,
    identityHash:null, clientIp:null, clientIpTrusted:false, canRevealAccount:false,
    clearedAt:t.clearedAt || expiresAt,
  };
  const account=conversation.user?.email || conversation.user?.name || null;
  return {...rest,userId:conversation.userId,account:maskSupportAccount(account),canRevealAccount:Boolean(account)};
}
export async function revealSupportAccount(turnId:string, adminId:string) {
  return prisma.$transaction(async tx => {
    const retention = await getSupportPolicy(tx);
    const turn = await tx.supportTurn.findFirst({where:{id:turnId,clearedAt:null,createdAt:{gt:new Date(Date.now()-(retention.detailRetentionDays ?? 90)*86400000)}},
      select:{conversation:{select:{user:{select:{email:true,name:true}}}}}});
    const account = turn?.conversation.user?.email || turn?.conversation.user?.name;
    if (!account) throw new OrderRequestError('账号信息已过期或不存在',404);
    // Fail closed: never return plaintext unless the audit record was persisted.
    await tx.supportRiskEvent.create({data:{category:'ADMIN_ACCOUNT_REVEAL',details:{adminId,turnId}}});
    return {account};
  });
}
export async function supportUsageSummary(query: SupportUsageQuery = {}) {
  const w = usageWindow(query), retention = await getSupportPolicy();
  const retentionStart = new Date(Date.now()-(retention.detailRetentionDays ?? 90)*86400000);
  const usageStart = new Date(Date.now()-(retention.usageRetentionDays ?? 180)*86400000);
  const guestPrefix = w.q.replace(/^游客\s*/u, '').toLowerCase();
  const identityFilters: Prisma.SupportTurnWhereInput[] = /^[a-f0-9]{1,64}$/.test(guestPrefix)
    ? [{ identityHash: { startsWith: guestPrefix } }] : [];
  const search: Prisma.SupportTurnWhereInput = w.q ? { clearedAt:null, createdAt:{gt:retentionStart}, OR: [
    {userText:{contains:w.q,mode:'insensitive'}},{answerText:{contains:w.q,mode:'insensitive'}},{requestId:w.q},...identityFilters,{clientIp:w.q},
    {conversation:{userId:w.q}},{conversation:{user:{email:{contains:w.q,mode:'insensitive'}}}},
  ] } : {};
  const focusedTurn: Prisma.SupportTurnWhereInput | undefined = w.turnId
    ? {id:w.turnId,clearedAt:null,createdAt:{gt:retentionStart}}
    : undefined;
  const detailCreatedAt = {gte: new Date(Math.max(w.start.getTime(), retentionStart.getTime())), lt:w.end};
  const turnWhere: Prisma.SupportTurnWhereInput = focusedTurn || {AND:[{createdAt:detailCreatedAt,clearedAt:null},search]};
  const where: Prisma.SupportModelCallWhereInput = focusedTurn
    ? {turn:focusedTurn}
    : {createdAt:{gte:new Date(Math.max(w.start.getTime(), usageStart.getTime())),lt:w.end},...(w.q ? {turn:search} : {})};
  const [aggregate, calls, missing, failures, turns, groups, total, items, turnTime] = await Promise.all([
    prisma.supportModelCall.aggregate({where,_sum:{inputTokens:true,cachedTokens:true,cacheWriteTokens:true,outputTokens:true,reasoningTokens:true,totalTokens:true,estimatedCost:true,reservedCny:true,settledCny:true},_avg:{latencyMs:true}}),
    prisma.supportModelCall.count({where:{...where,usageStatus:{not:'NOT_SENT'}}}), prisma.supportModelCall.count({where:{...where,usageStatus:{in:['MISSING','PENDING']}}}),
    prisma.supportModelCall.count({where:{...where,success:false,usageStatus:{not:'NOT_SENT'}}}), prisma.supportTurn.count({where:turnWhere}),
    prisma.supportTurn.groupBy({by:['status'],where:turnWhere,_count:true}),
    w.view==='turns' ? prisma.supportTurn.count({where:turnWhere}) : prisma.supportModelCall.count({where}),
    w.view==='turns'
      ? prisma.supportTurn.findMany({where:turnWhere,select:{...turnSelect,modelCalls:{orderBy:{sequence:'asc'},select:{id:true,phase:true,sequence:true,latencyMs:true,success:true,errorCode:true,inputTokens:true,outputTokens:true,totalTokens:true,cachedTokens:true,cacheWriteTokens:true,reasoningTokens:true,estimatedCost:true,usageStatus:true,requestModel:true,responseModel:true,accountingState:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(w.page-1)*w.pageSize,take:w.pageSize})
      : prisma.supportModelCall.findMany({where,select:{id:true,createdAt:true,phase:true,sequence:true,provider:true,requestModel:true,responseModel:true,inputTokens:true,cachedTokens:true,cacheWriteTokens:true,outputTokens:true,reasoningTokens:true,totalTokens:true,estimatedCost:true,usageStatus:true,latencyMs:true,success:true,errorCode:true,rateSnapshot:true,accountingState:true,reservedCny:true,settledCny:true,turn:{select:turnSelect}},orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(w.page-1)*w.pageSize,take:w.pageSize}),
    prisma.supportTurn.aggregate({where:turnWhere,_avg:{latencyMs:true}}),
  ]);
  const sum = aggregate._sum;
  const unknown = await prisma.supportModelCall.aggregate({where:{...where,accountingState:{in:['PENDING','UNCERTAIN']}},_sum:{reservedCny:true}});
  return { page:w.page,pageSize:w.pageSize,total,hasMore:w.page*w.pageSize<total,from:w.from,to:w.to,view:w.view,detailRetentionDays:retention.detailRetentionDays ?? 90,usageRetentionDays:retention.usageRetentionDays ?? 180,
    summary:{calls,turns,failures,usageMissing:missing,input:sum.inputTokens||0,cached:sum.cachedTokens||0,writes:sum.cacheWriteTokens||0,
      output:sum.outputTokens||0,reasoning:sum.reasoningTokens||0,totalTokens:sum.totalTokens||0,costUsd:Number(sum.estimatedCost||0),
      unsettledCny:Number(unknown._sum.reservedCny||0),avgCallMs:Math.round(aggregate._avg.latencyMs||0),avgTurnMs:Math.round(turnTime._avg.latencyMs||0),
      statuses:Object.fromEntries(groups.map(g=>[g.status,g._count]))},
    items:items.map(item => 'turn' in item ? {...item,turn:turnDto(item.turn,retention.detailRetentionDays ?? 90)} : {...turnDto(item,retention.detailRetentionDays ?? 90),modelCalls:item.modelCalls}),
  };
}
export const riskQuerySchema = z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(10).max(100).default(25)}).strict();
export async function listSupportRisk(input: z.input<typeof riskQuerySchema> = {}) {
  const q=riskQuerySchema.parse(input);
  const policy=await getSupportPolicy();
  const cutoff=new Date(Date.now()-policy.detailRetentionDays*86400000);
  const retainedWhere={createdAt:{gt:cutoff}};
  const [events,total,blocks] = await Promise.all([
    prisma.supportRiskEvent.findMany({where:retainedWhere,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:(q.page-1)*q.pageSize,take:q.pageSize}),prisma.supportRiskEvent.count({where:retainedWhere}),
    prisma.supportBlock.findMany({where:{revokedAt:null,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},take:100}),
  ]);
  const references=events.map(event=>{
    const details=event.details&&typeof event.details==='object'&&!Array.isArray(event.details)?event.details:{};
    return {event,adminId:typeof details.adminId==='string'?details.adminId:null,
      turnId:event.category==='ADMIN_ACCOUNT_REVEAL'&&typeof details.turnId==='string'?details.turnId:null};
  });
  const adminIds=[...new Set(references.flatMap(ref=>ref.adminId?[ref.adminId]:[]))];
  const turnIds=[...new Set(references.flatMap(ref=>ref.turnId?[ref.turnId]:[]))];
  const userIds=[...new Set(events.flatMap(event=>event.userId?[event.userId]:[]))];
  const [admins,turns,users]=await Promise.all([
    prisma.admin.findMany({where:{id:{in:adminIds}},select:{id:true,username:true}}),
    prisma.supportTurn.findMany({where:{id:{in:turnIds},clearedAt:null,createdAt:{gt:cutoff}},select:{id:true,userText:true,clientIp:true,clientIpTrusted:true,conversation:{select:{user:{select:{email:true,name:true}}}}}}),
    prisma.user.findMany({where:{id:{in:userIds}},select:{id:true,email:true,name:true}}),
  ]);
  const adminMap=new Map(admins.map(admin=>[admin.id,admin.username]));
  const turnMap=new Map(turns.map(turn=>[turn.id,turn]));
  const userMap=new Map(users.map(user=>[user.id,maskSupportAccount(user.email||user.name)]));
  const displayEvents=references.map(({event,adminId,turnId})=>{
    const adminEvent=event.category.startsWith('ADMIN_');
    const revealEvent=event.category==='ADMIN_ACCOUNT_REVEAL';
    const turn=turnId?turnMap.get(turnId):undefined;
    const retained=event.createdAt>cutoff;
    return {...event,display:{
      adminAccount:adminEvent?(adminId?adminMap.get(adminId)||'管理员已删除':'未知管理员'):null,
      question:turn?.userText??null,
      account:revealEvent?maskSupportAccount(turn?.conversation.user?.email||turn?.conversation.user?.name)
        :retained&&event.userId?userMap.get(event.userId)??null:null,
      ip:revealEvent?(turn?.clientIpTrusted?turn.clientIp:null):retained?event.clientIp:null,
    }};
  });
  return {...q,total,hasMore:q.page*q.pageSize<total,events:displayEvents,blocks};
}
export const blockSchema=z.object({action:z.literal('block'),source:z.enum(['turn','event']),id:z.string().min(1).max(100),kind:z.enum(['identity','user','ip']),reason:z.string().trim().min(1).max(300)}).strict();
export async function createSupportBlock(input: z.infer<typeof blockSchema>, createdBy: string) {
  const policy=await getSupportPolicy();
  const createdAt={gt:new Date(Date.now()-policy.detailRetentionDays*86400000)};
  const ref = input.source==='turn'
    ? await prisma.supportTurn.findFirst({where:{id:input.id,clearedAt:null,createdAt},select:{identityHash:true,clientIp:true,clientIpTrusted:true,conversation:{select:{userId:true}}}})
    : await prisma.supportRiskEvent.findFirst({where:{id:input.id,createdAt}});
  if (!ref) throw new z.ZodError([{code:'custom',path:['id'],message:'记录已过期或不存在'}]);
  const userId='conversation' in ref ? ref.conversation.userId : ref.userId;
  const ip = 'clientIpTrusted' in ref && !ref.clientIpTrusted ? null : ref.clientIp;
  const keyHash = input.kind==='identity' ? ref.identityHash : input.kind==='user' && userId ? riskHash(`user:${userId}`) : input.kind==='ip' && ip ? riskHash(ip) : null;
  if (!keyHash) throw new z.ZodError([{code:'custom',path:['kind'],message:'此记录没有可封禁的身份或可信 IP'}]);
  const label=input.kind==='ip'?ip!:input.kind==='user'?userId!:`游客/身份 ${keyHash.slice(0,10)}`;
  return prisma.$transaction(async tx=>{
    const block=await tx.supportBlock.create({data:{kind:input.kind,keyHash,label,reason:redactSupportText(input.reason),expiresAt:new Date(Date.now()+86400000),createdBy}});
    await tx.supportRiskEvent.create({data:{category:'ADMIN_BLOCK',details:{adminId:createdBy,blockId:block.id,reason:block.reason}}});return block;
  });
}
export async function revokeSupportBlock(id:string,revokedBy:string) {
  return prisma.$transaction(async tx=>{
    const result=await tx.supportBlock.updateMany({where:{id,revokedAt:null},data:{revokedAt:new Date(),revokedBy}});
    if(result.count) await tx.supportRiskEvent.create({data:{category:'ADMIN_UNBLOCK',details:{adminId:revokedBy,blockId:id}}});return result;
  });
}
