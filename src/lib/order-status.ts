/**
 * 订单状态配置 - 统一管理订单状态的文本和样式
 */

export interface OrderStatusInfo {
  text: string;
  color: string;
}

export const ORDER_STATUS_MAP: Record<string, OrderStatusInfo> = {
  PENDING: { text: "待支付", color: "bg-yellow-100 text-yellow-600" },
  PAID: { text: "已支付", color: "bg-blue-100 text-blue-600" },
  DELIVERED: { text: "已发货", color: "bg-green-100 text-green-600" },
  COMPLETED: { text: "已完成", color: "bg-green-100 text-green-600" },
  CANCELLED: { text: "已取消", color: "bg-gray-100 text-gray-600" },
  REFUNDED: { text: "已退款", color: "bg-red-100 text-red-600" },
};

export function getOrderStatusInfo(status: string): OrderStatusInfo {
  return ORDER_STATUS_MAP[status] || { text: status, color: "bg-gray-100 text-gray-600" };
}

export function getOrderStatusText(status: string): string {
  return getOrderStatusInfo(status).text;
}

export function getOrderStatusColor(status: string): string {
  return getOrderStatusInfo(status).color;
}
