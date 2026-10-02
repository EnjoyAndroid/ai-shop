import { NextRequest } from "next/server";
import { handleXunhuCallback } from "@/lib/payment/callback";
export async function POST(request: NextRequest) { return handleXunhuCallback(request, "wechat"); }
