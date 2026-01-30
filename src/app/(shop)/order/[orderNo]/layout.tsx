import { Metadata } from "next";

export const metadata: Metadata = {
  title: "订单详情",
};

export default function OrderDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
