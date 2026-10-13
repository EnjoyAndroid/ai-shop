"use client";
import { useQuery } from "@tanstack/react-query";
import { getPublicContactSettings, type PublicContactSettings } from "@/lib/contact-settings";

export function useContactSettings() {
  const { data } = useQuery({
    queryKey: ["public-contact-settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings/contact", { cache: "no-store" });
      if (!response.ok) throw new Error("无法获取客服设置");
      return response.json() as Promise<PublicContactSettings>;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return getPublicContactSettings({ ...data });
}
