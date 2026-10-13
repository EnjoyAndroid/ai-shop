"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const menuItems = [
  { href: "/admin/dashboard", label: "仪表盘", icon: "📊" },
  { href: "/admin/orders", label: "订单管理", icon: "📦" },
  { href: "/admin/products", label: "商品管理", icon: "🛍️" },
  { href: "/admin/categories", label: "分类管理", icon: "📁" },
  { href: "/admin/cardkeys", label: "卡密管理", icon: "🔑" },
  { href: "/admin/users", label: "用户管理", icon: "👥" },
  { href: "/admin/announcements", label: "公告管理", icon: "📢" },
  { href: "/admin/contact", label: "客服与社群", icon: "💬" },
  { href: "/admin/settings", label: "系统设置", icon: "⚙️" },
];

function MenuLabel({ label, icon }: { label: string; icon: string }) {
  const { pending } = useLinkStatus();
  return <><span className="text-lg" aria-hidden="true">{icon}</span><span className="flex-1">{label}</span>{pending && <Loader2 aria-label="正在切换后台页面" className="h-4 w-4 shrink-0 animate-spin" />}</>;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    if (!confirm("确定要退出登录吗？")) return;

    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
      router.push("/admin/login");
      router.refresh();
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  return (
    <aside aria-label="后台侧栏" className="w-64 shrink-0 bg-gray-900 h-screen text-white flex flex-col sticky top-0">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800">
        <Link href="/admin/dashboard" className="text-xl font-bold">
          AI Shop 管理
        </Link>
      </div>

      {/* 菜单 */}
      <nav aria-label="后台管理导航" className="min-h-0 flex-1 overflow-y-auto p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={true}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-400 hover:bg-gray-800 hover:text-white"
                  }`}
                >
                  <MenuLabel label={item.label} icon={item.icon} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 底部 */}
      <div className="p-4 border-t border-gray-800 space-y-2">
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
        >
          <span>🏠</span>
          <span>返回前台</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-gray-800"
        >
          <span>🚪</span>
          <span>退出登录</span>
        </button>
      </div>
    </aside>
  );
}
