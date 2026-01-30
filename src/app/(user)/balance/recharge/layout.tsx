import { Metadata } from "next";

export const metadata: Metadata = {
  title: "余额充值",
};

export default function RechargeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
