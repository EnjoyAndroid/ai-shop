import { Metadata } from "next";
import { OrderQueryClient } from "./order-query-client";

export const metadata: Metadata = {
  title: "订单查询",
};

export default function OrderQueryPage() {
  return <OrderQueryClient />;
}
