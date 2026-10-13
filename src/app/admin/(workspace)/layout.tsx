import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { AdminSidebar } from "@/components/admin/sidebar";

export default async function AdminWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return <div className="flex min-h-screen bg-gray-100">
    <AdminSidebar />
    <main id="admin-content" className="min-w-0 flex-1 p-8">{children}</main>
  </div>;
}
