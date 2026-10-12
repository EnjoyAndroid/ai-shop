import Link from "next/link";
import { ArrowUpRight, MessageCircle } from "lucide-react";

export function CommunityEntry() {
  return (
    <section aria-labelledby="community-title" className="flex flex-col sm:flex-row items-center gap-6 rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/70 p-6 md:p-8">
      <div className="flex-1 text-center sm:text-left">
        <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
          <MessageCircle size={18} aria-hidden="true" /> AI Shop 社区
        </div>
        <h2 id="community-title" className="text-xl font-bold text-gray-900">微信交流群</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">一起交流项目部署、使用经验和功能建议。</p>
        <Link href="/community" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-900">
          查看入群二维码 <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <Link href="/community" className="shrink-0 rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm" aria-label="打开微信交流群入群页面">
        <img src="/api/community/entry-qr" alt="微信交流群固定入口二维码" width={128} height={128} className="h-32 w-32" loading="lazy" />
        <span className="mt-1 block text-xs text-gray-500">微信扫码</span>
      </Link>
    </section>
  );
}
