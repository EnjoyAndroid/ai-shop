import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import prisma from "@/lib/db";

import { getAdminSecret } from "./security-config";

export interface AdminSession {
  id: string;
  username: string;
  name: string | null;
  role: string;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const token = (await cookies()).get("admin_token")?.value;

    if (!token) {
      return null;
    }

    const { payload } = await jwtVerify(token, getAdminSecret(), { algorithms: ["HS256"] });

    const admin = await prisma.admin.findUnique({
      where: { id: payload.id as string },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        status: true,
        sessionVersion: true,
      },
    });

    if (!admin || admin.status !== "ACTIVE" || payload.sessionVersion !== admin.sessionVersion) {
      return null;
    }

    return {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
    };
  } catch (error) {
    return null;
  }
}

export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

export function hasAdminPermission(admin: AdminSession, permission: "finance" | "settings" | "users"): boolean {
  return admin.role === "SUPER_ADMIN" || (admin.role === "ADMIN" && permission !== "settings");
}
