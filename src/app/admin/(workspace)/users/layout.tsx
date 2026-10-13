import { Metadata } from "next";

export const metadata: Metadata = {
  title: "用户管理 - 管理后台",
};

export default function AdminUsersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
