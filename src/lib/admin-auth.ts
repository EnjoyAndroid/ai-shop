import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import prisma from "@/lib/db";

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "admin-secret-key"
);

export interface AdminSession {
  id: string;
  username: string;
  name: string | null;
  role: string;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const token = cookies().get("admin_token")?.value;

    if (!token) {
      return null;
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);

    const admin = await prisma.admin.findUnique({
      where: { id: payload.id as string },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        status: true,
      },
    });

    if (!admin || admin.status !== "ACTIVE") {
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
