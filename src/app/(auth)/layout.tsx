import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // 已登录用户跳转到首页
  if (session?.user) {
    redirect("/");
  }

  return <>{children}</>;
}
