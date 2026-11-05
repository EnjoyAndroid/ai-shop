import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { redirect } from "next/navigation";
import { SupportAdminPanel } from "@/components/admin/support-admin-panel";

export const metadata = { title: "智能客服 - 管理后台" };

export default async function SupportPage() {
  const admin = await getAdminSession();
  if (!admin || !hasAdminPermission(admin, "settings")) redirect("/admin/dashboard");
  return <SupportAdminPanel />;
}

