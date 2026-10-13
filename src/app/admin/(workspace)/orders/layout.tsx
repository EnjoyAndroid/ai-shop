import { Metadata } from "next";

export const metadata: Metadata = {
  title: "订单管理 - 管理后台",
};

export default function AdminOrdersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
