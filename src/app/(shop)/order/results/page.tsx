import { Metadata } from "next";
import { OrderResultsClient } from "./order-results-client";

export const metadata: Metadata = { title: "订单列表", robots: { index: false, follow: false } };
export default function OrderResultsPage() { return <OrderResultsClient />; }
