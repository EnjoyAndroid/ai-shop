import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/shop/header";
import { CommunityPanel } from "@/components/shop/community-panel";
import { getSettings } from "@/lib/services/settings.service";
import { getCommunitySettings } from "@/lib/community-settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "微信交流群", description: "AI Shop 微信交流群，交流项目部署、使用经验和功能建议。" };

export default async function CommunityPage() {
  const settings = getCommunitySettings(await getSettings());
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />
      <main className="container mx-auto flex-1 px-4 py-10 sm:py-16">
        <CommunityPanel initialSettings={settings} />
        <div className="mt-6 text-center"><Link href="/" className="text-sm text-gray-500 hover:text-gray-800">返回首页</Link></div>
      </main>
    </div>
  );
}
