"use client";

const TELEGRAM_URL = "https://t.me/ai_shop_5";

interface ContactSupportProps {
  prefix?: string;
}

export function ContactSupport({ prefix = "如有问题，请" }: ContactSupportProps) {
  return (
    <div className="text-center text-sm text-gray-500">
      <p>
        {prefix}
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          联系客服
        </a>
      </p>
    </div>
  );
}
