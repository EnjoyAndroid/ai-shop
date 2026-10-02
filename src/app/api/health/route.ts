import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import redis from "@/lib/redis";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
