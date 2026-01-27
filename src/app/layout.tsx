import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Shop - AI 服务自助充值平台",
  description: "专业的 AI 服务充值平台，提供 ChatGPT、Claude、Cursor 等 AI 工具的账号和充值服务",
  keywords: "ChatGPT, Claude, Cursor, AI, 充值, 账号",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
