"use client";

import { useState } from "react";

const EMAIL = "komarkonde@gmail.com";
const TELEGRAM_URL = "https://t.me/ai_pro_labs";

export function ContactButtons() {
  const [showToast, setShowToast] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  return (
    <>
      <div className="flex justify-center gap-4">
        <button
          onClick={handleCopyEmail}
          className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          📧 发送邮件
        </button>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          💬 Telegram
        </a>
      </div>

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 bg-primary text-white rounded-lg shadow-lg z-50">
          已复制邮箱地址
        </div>
      )}
    </>
  );
}

interface CopyEmailLinkProps {
  className?: string;
}

export function CopyEmailLink({ className = "" }: CopyEmailLinkProps) {
  const [showToast, setShowToast] = useState(false);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  };

  return (
    <>
      <button
        onClick={handleCopyEmail}
        className={className}
      >
        {EMAIL}
      </button>

      {/* Toast 提示 */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 bg-primary text-white rounded-lg shadow-lg z-50">
          已复制邮箱地址
        </div>
      )}
    </>
  );
}
