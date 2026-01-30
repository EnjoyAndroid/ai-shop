import { Metadata } from "next";

export const metadata: Metadata = {
  title: "支付",
};

export default function PayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
