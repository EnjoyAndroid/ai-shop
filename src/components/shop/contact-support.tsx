"use client";
import { CONTACT_EMAIL } from "@/lib/public-config";
import { useContactSettings } from "./use-contact-settings";
export function ContactSupport({ prefix = "如有问题，请" }: { prefix?: string }) {
  const { telegramUrl } = useContactSettings();
  const url = telegramUrl || (CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "");
  if (!url) return null;
  return <div className="text-center text-sm text-gray-500"><p>{prefix}<a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">联系客服</a></p></div>;
}
