import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();

  // 如果未登录且不是登录页面，重定向到登录页
  // 注意：登录页面不需要验证
  if (!session) {
    // 这里不能直接 redirect，因为登录页也在这个 layout 下
    // 我们在各个页面单独处理
  }

  return <>{children}</>;
}
