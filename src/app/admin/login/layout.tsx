import { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理员登录",
};

export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
