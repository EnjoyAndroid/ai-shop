import { redirect } from "next/navigation";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { ContactSettingsForm } from "@/components/admin/contact-settings-form";

export const metadata = { title: "客服与社群 - 管理后台" };

export default async function ContactSettingsPage() {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  if (!hasAdminPermission(admin, "settings")) redirect("/admin/dashboard");
  return <ContactSettingsForm />;
}
