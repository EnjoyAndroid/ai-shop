import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { adminDestination } from "@/lib/admin-navigation";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const destination = adminDestination((await searchParams).next);
  if (await getAdminSession()) redirect(destination);
  return <AdminLoginForm destination={destination} />;
}
