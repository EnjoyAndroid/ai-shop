import { Metadata } from "next";

export const metadata: Metadata = {
  title: "商品管理 - 管理后台",
};

export default function AdminProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
