import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "管理员登录",
};

export default async function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 如果已登录，重定向到后台仪表盘
  const admin = await getAdminSession();
  if (admin) {
    redirect("/admin/dashboard");
  }

  return <>{children}</>;
}
