"use client";

const steps = [
  {
    icon: "1️⃣",
    title: "选择商品",
    description: "浏览分类，选择需要的商品",
    bgColor: "bg-blue-100",
  },
  {
    icon: "2️⃣",
    title: "填写信息",
    description: "填写邮箱并设置订单查询密码",
    bgColor: "bg-green-100",
  },
  {
    icon: "3️⃣",
    title: "完成支付",
    description: "支持支付宝、微信、USDT",
    bgColor: "bg-yellow-100",
  },
  {
    icon: "4️⃣",
    title: "获取卡密",
    description: "支付成功后自动发送卡密",
    bgColor: "bg-purple-100",
  },
];

export function PurchaseSteps() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {steps.map((step, index) => (
        <div key={index} className="text-center p-4">
          <div
            className={`w-16 h-16 ${step.bgColor} rounded-full flex items-center justify-center mx-auto mb-4`}
          >
            <span className="text-2xl">{step.icon}</span>
          </div>
          <h3 className="font-semibold mb-2">{step.title}</h3>
          <p className="text-sm text-gray-500">{step.description}</p>
        </div>
      ))}
    </div>
  );
}
