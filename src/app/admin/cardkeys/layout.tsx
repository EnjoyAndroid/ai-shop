import { Metadata } from "next";

export const metadata: Metadata = {
  title: "卡密管理 - 管理后台",
};

export default function AdminCardkeysLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
