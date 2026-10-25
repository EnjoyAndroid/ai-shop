import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
export const SUPPORT_CONFIG_LOCK = 730251;
import { supportPolicy } from './config';

// Admission and destructive cleanup must not fall back to a stale cache or
// defaults on a settings-store failure. Read only the six policy keys.
export async function getSupportPolicy(client: Pick<Prisma.TransactionClient, 'systemSetting'> = prisma) {
  const rows = await client.systemSetting.findMany({where:{key:{in:[
    'supportDetailRetentionDays','supportUsageRetentionDays',
    'supportGuestDailyModelTurns','supportMemberDailyModelTurns',
    'supportGuestPerMinute','supportMemberPerMinute',
  ]}},select:{key:true,value:true}});
  return supportPolicy(Object.fromEntries(rows.map(row=>[row.key,row.value])));
}
