import Link from "next/link";
import { Header } from "@/components/shop/header";

export const metadata = {
  title: "使用帮助",
  description: "AI Shop 使用帮助和常见问题",
};

export default function HelpPage() {
  const faqs = [
    {
      question: "如何购买商品？",
      answer:
        "1. 浏览商品并选择需要的商品\n2. 点击「立即购买」或加入购物车\n3. 填写接收卡密的邮箱或手机号\n4. 选择支付方式并完成支付\n5. 支付成功后卡密会自动发送到您的邮箱",
    },
    {
      question: "支持哪些支付方式？",
      answer:
        "目前支持以下支付方式：\n• 支付宝\n• 微信支付\n• USDT (TRC20/ERC20)\n• 账户余额（需注册会员）",
    },
    {
      question: "如何查询订单？",
      answer:
        "1. 点击页面顶部的「订单查询」\n2. 输入您的订单号\n3. 输入下单时收到的查询密码\n4. 点击查询即可查看订单详情和卡密",
    },
    {
      question: "卡密没有收到怎么办？",
      answer:
        "1. 请检查邮箱的垃圾邮件文件夹\n2. 确认支付已成功完成\n3. 使用订单查询功能查看卡密\n4. 如仍未解决，请联系客服",
    },
    {
      question: "卡密无法使用怎么办？",
      answer:
        "1. 请确认按照商品说明正确使用\n2. 检查是否有输入错误（空格、大小写等）\n3. 如确认卡密有问题，请联系客服并提供订单号",
    },
    {
      question: "如何成为会员？",
      answer:
        "点击页面右上角的「注册」按钮，填写邮箱或手机号和密码即可注册成为会员。会员可享受：\n• 余额支付\n• 会员折扣\n• 订单历史记录\n• 更多专属优惠",
    },
    {
      question: "会员等级如何升级？",
      answer:
        "会员等级根据累计消费金额自动升级：\n• 普通会员：注册即享\n• 银牌会员：消费满 100 元，享 95 折\n• 金牌会员：消费满 500 元，享 9 折\n• 钻石会员：消费满 1000 元，享 85 折",
    },
    {
      question: "可以申请退款吗？",
      answer:
        "由于虚拟商品的特殊性，卡密一经发出概不退款。请在购买前仔细确认商品信息。如卡密确实存在问题无法使用，请联系客服处理。",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* 面包屑 */}
        <nav className="mb-6 text-sm">
          <ol className="flex items-center space-x-2 text-gray-500">
            <li>
              <Link href="/" className="hover:text-primary">
                首页
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-800">使用帮助</li>
          </ol>
        </nav>

        {/* 页面标题 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 mb-8 text-white">
          <h1 className="text-3xl font-bold mb-2">使用帮助</h1>
          <p className="opacity-90">常见问题解答，帮助您快速上手</p>
        </div>

        {/* 快速入门 */}
        <div className="bg-white rounded-2xl p-8 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">🚀 快速入门</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center p-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">1️⃣</span>
              </div>
              <h3 className="font-semibold mb-2">选择商品</h3>
              <p className="text-sm text-gray-500">浏览分类，选择需要的 AI 服务</p>
            </div>
            <div className="text-center p-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">2️⃣</span>
              </div>
              <h3 className="font-semibold mb-2">填写信息</h3>
              <p className="text-sm text-gray-500">填写接收卡密的邮箱或手机</p>
            </div>
            <div className="text-center p-4">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">3️⃣</span>
              </div>
              <h3 className="font-semibold mb-2">完成支付</h3>
              <p className="text-sm text-gray-500">选择支付方式并完成付款</p>
            </div>
            <div className="text-center p-4">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">4️⃣</span>
              </div>
              <h3 className="font-semibold mb-2">获取卡密</h3>
              <p className="text-sm text-gray-500">支付成功后自动发送卡密</p>
            </div>
          </div>
        </div>

        {/* 常见问题 */}
        <div className="bg-white rounded-2xl p-8">
          <h2 className="text-xl font-bold text-gray-800 mb-6">❓ 常见问题</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details
                key={index}
                className="group border rounded-lg overflow-hidden"
              >
                <summary className="flex items-center justify-between p-4 cursor-pointer bg-gray-50 hover:bg-gray-100">
                  <span className="font-medium text-gray-800">{faq.question}</span>
                  <span className="text-gray-400 group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>
                <div className="p-4 bg-white">
                  <p className="text-gray-600 whitespace-pre-line">{faq.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* 联系客服 */}
        <div className="mt-8 bg-blue-50 rounded-2xl p-8 text-center">
          <h2 className="text-xl font-bold text-gray-800 mb-4">还有其他问题？</h2>
          <p className="text-gray-600 mb-6">
            如果以上内容没有解决您的问题，请联系我们的客服
          </p>
          <div className="flex justify-center gap-4">
            <a
              href="#"
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              📧 发送邮件
            </a>
            <a
              href="#"
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              💬 Telegram
            </a>
          </div>
        </div>
      </main>

      {/* 页脚 */}
      <footer className="bg-gray-800 text-gray-300 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm">
          © 2026 AI Shop. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
