import { Metadata } from "next";

export const metadata: Metadata = {
  title: "分类管理 - 管理后台",
};

export default function AdminCategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
