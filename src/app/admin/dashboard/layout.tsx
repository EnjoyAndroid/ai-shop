import { Metadata } from "next";

export const metadata: Metadata = {
  title: "仪表盘 - 管理后台",
};

export default function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
