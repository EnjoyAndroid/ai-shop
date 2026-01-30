import { Metadata } from "next";

export const metadata: Metadata = {
  title: "结算",
};

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
