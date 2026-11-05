import { notFound, redirect } from 'next/navigation';
import { getAdminSession, hasAdminPermission } from '@/lib/admin-auth';
import { supportEvaluationEnabled } from '@/lib/support/evaluation/access';
import { SupportEvaluation } from '@/components/admin/support-evaluation';
export const dynamic = 'force-dynamic';
export const metadata = { title: '双版本试聊 - 智能客服' };
export default async function SupportEvaluationPage() {
  if (!supportEvaluationEnabled()) notFound();
  const admin = await getAdminSession();
  if (!admin || !hasAdminPermission(admin, 'settings')) redirect('/admin/dashboard');
  return <SupportEvaluation />;
}
