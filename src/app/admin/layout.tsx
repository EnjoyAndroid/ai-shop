import { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理后台",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
