"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

const links = [
  { href: "/dashboard", label: "个人中心" },
  { href: "/orders", label: "我的订单" },
  { href: "/balance", label: "我的余额" },
];

function NavigationLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <><span>{label}</span>{pending && <Loader2 aria-label="正在切换" className="h-4 w-4 animate-spin" />}</>;
}

export function UserSidebar() {
  const pathname = usePathname();
  return (
    <aside className="lg:col-span-1">
      <div className="rounded-xl bg-white p-4 sm:p-6 lg:sticky lg:top-24">
        <nav aria-label="个人中心导航" className="flex gap-2 lg:flex-col">
          {links.map(link => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return <Link key={link.href} href={link.href} prefetch={true} aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors lg:justify-between lg:px-4 lg:text-base ${active ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}>
              <NavigationLabel label={link.label} />
            </Link>;
          })}
        </nav>
      </div>
    </aside>
  );
}
