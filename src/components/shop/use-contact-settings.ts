"use client";
import { useQuery } from "@tanstack/react-query";
import { getSafeTelegramUrl } from "@/lib/contact-settings";

export function useContactSettings() {
  const { data } = useQuery({
    queryKey: ["public-contact-settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings/contact", { cache: "no-store" });
      if (!response.ok) throw new Error("无法获取客服设置");
      return response.json() as Promise<{ telegramUrl: string }>;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return { telegramUrl: getSafeTelegramUrl(data?.telegramUrl) };
}
