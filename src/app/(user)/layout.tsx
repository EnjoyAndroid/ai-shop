import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Header } from "@/components/shop/header";
import { UserSidebar } from "@/components/user/sidebar";

export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8">
          <UserSidebar />
          <div className="min-w-0 lg:col-span-3">{children}</div>
        </div>
      </main>
    </div>
  );
}
