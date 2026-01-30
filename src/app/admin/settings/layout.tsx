import { Metadata } from "next";

export const metadata: Metadata = {
  title: "系统设置 - 管理后台",
};

export default function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
