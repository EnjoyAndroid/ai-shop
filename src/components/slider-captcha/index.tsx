"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface SliderCaptchaProps {
  onSuccess: (token: string) => void;
  onError?: (message: string) => void;
}

interface CaptchaState {
  token: string;
  position: number; // 缺口位置
  config: {
    width: number;
    height: number;
    sliderSize: number;
  };
}

export default function SliderCaptcha({ onSuccess, onError }: SliderCaptchaProps) {
  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [sliderX, setSliderX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const sliderWidthRef = useRef(0);

  const fetchCaptcha = useCallback(async () => {
    setStatus("loading");
    setSliderX(0);
    setMessage("");

    try {
      const response = await fetch("/api/captcha/generate", {
        method: "POST",
      });
      const data = await response.json();

      if (data.success) {
        setCaptcha(data);
        setStatus("idle");
      } else {
        setStatus("error");
        setMessage("获取验证码失败");
      }
    } catch {
      setStatus("error");
      setMessage("网络错误");
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha]);

  useEffect(() => {
    if (containerRef.current && captcha) {
      sliderWidthRef.current = captcha.config.width - captcha.config.sliderSize;
    }
  }, [captcha]);

  const verifyPosition = useCallback(async () => {
    if (!captcha) return;

    setStatus("loading");

    try {
      const response = await fetch("/api/captcha/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: captcha.token,
          position: Math.round(sliderX),
        }),
      });
      const data = await response.json();

      if (data.success) {
        setStatus("success");
        setMessage("验证成功");
        onSuccess(captcha.token);
      } else {
        setStatus("error");
        setMessage(data.error || "验证失败，请重试");
        onError?.(data.error || "验证失败");
        setTimeout(() => {
          fetchCaptcha();
        }, 1200);
      }
    } catch {
      setStatus("error");
      setMessage("验证请求失败");
      onError?.("验证请求失败");
    }
  }, [captcha, sliderX, onSuccess, onError, fetchCaptcha]);

  const handleDragStart = useCallback((clientX: number) => {
    if (status === "success" || status === "loading") return;
    setIsDragging(true);
    startXRef.current = clientX - sliderX;
  }, [sliderX, status]);

  const handleDragMove = useCallback((clientX: number) => {
    if (!isDragging) return;
    let newX = clientX - startXRef.current;
    newX = Math.max(0, Math.min(newX, sliderWidthRef.current));
    setSliderX(newX);
  }, [isDragging]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (sliderX > 10) {
      verifyPosition();
    }
  }, [isDragging, sliderX, verifyPosition]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    handleDragStart(e.touches[0].clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientX);
    const handleTouchEnd = () => handleDragEnd();

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  if (!captcha) {
    return (
      <div className="w-full max-w-[320px] h-[180px] bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
        <div className="flex items-center gap-2 text-gray-400">
          <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">加载验证码...</span>
        </div>
      </div>
    );
  }

  const { config } = captcha;
  const progressPercent = (sliderX / sliderWidthRef.current) * 100 || 0;

  return (
    <div className="w-full max-w-[320px] select-none" ref={containerRef}>
      {/* 主容器 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {/* 背景图区域 */}
        <div
          className="relative overflow-hidden"
          style={{ width: "100%", height: config.height }}
        >
          {/* 渐变背景 */}
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)",
            }}
          />

          {/* 网格纹理 */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)
              `,
              backgroundSize: "20px 20px",
            }}
          />

          {/* 装饰元素 */}
          <div className="absolute inset-0">
            <div className="absolute top-3 left-4 w-12 h-12 rounded-full bg-white/10 blur-sm" />
            <div className="absolute top-8 right-8 w-16 h-16 rounded-full bg-white/8 blur-md" />
            <div className="absolute bottom-4 left-1/4 w-8 h-8 rounded-lg bg-white/10 rotate-12" />
            <div className="absolute bottom-6 right-1/4 w-6 h-6 rounded-full bg-white/15" />
          </div>

          {/* 缺口位置 */}
          <div
            className="absolute rounded-lg backdrop-blur-sm"
            style={{
              width: config.sliderSize + 4,
              height: config.sliderSize + 4,
              left: captcha.position - 2,
              top: (config.height - config.sliderSize) / 2 - 2,
              background: "rgba(0,0,0,0.3)",
              border: "2px dashed rgba(255,255,255,0.5)",
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.2)",
            }}
          />

          {/* 可拖动滑块 */}
          <div
            className={`absolute rounded-lg cursor-grab ${
              isDragging ? "cursor-grabbing" : ""
            } ${status === "success" ? "ring-2 ring-green-400 ring-offset-1" : ""}`}
            style={{
              width: config.sliderSize,
              height: config.sliderSize,
              transform: `translateX(${sliderX}px)`,
              top: (config.height - config.sliderSize) / 2,
              background: "linear-gradient(145deg, #ffffff 0%, #f3f4f6 100%)",
              boxShadow: "0 4px 15px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.1)",
              border: "1px solid rgba(255,255,255,0.8)",
              willChange: isDragging ? "transform" : "auto",
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <div className="w-full h-full flex items-center justify-center">
              {status === "success" ? (
                <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <div className="flex gap-0.5">
                  <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
                  <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
                  <div className="w-0.5 h-3 bg-gray-400 rounded-full" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 滑动轨道 */}
        <div className="relative h-12 bg-gray-50 border-t border-gray-100">
          {/* 进度条 */}
          <div
            className="absolute left-0 top-0 h-full"
            style={{
              width: sliderX + 22,
              background: status === "success"
                ? "linear-gradient(90deg, #22c55e 0%, #16a34a 100%)"
                : status === "error"
                ? "linear-gradient(90deg, #ef4444 0%, #dc2626 100%)"
                : "linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)",
              opacity: 0.15,
            }}
          />

          {/* 滑块按钮 */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center rounded-lg ${
              status === "success" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-white border border-gray-200"
            }`}
            style={{
              width: 44,
              height: 36,
              transform: `translateX(${sliderX}px) translateY(-50%)`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              willChange: isDragging ? "transform" : "auto",
            }}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            {status === "loading" ? (
              <svg className="w-5 h-5 text-gray-400 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : status === "success" ? (
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : status === "error" ? (
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 5l7 7-7 7" />
                <path d="M6 5l7 7-7 7" />
              </svg>
            )}
          </div>

          {/* 提示文字 */}
          {sliderX === 0 && status === "idle" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-sm text-gray-400 pl-12">
                向右滑动完成验证
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between mt-3 px-1">
        <div className="flex items-center gap-1.5">
          {status === "success" && (
            <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
              <polyline points="9 12 12 15 16 10" />
            </svg>
          )}
          {status === "error" && (
            <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          <span
            className={`text-sm ${
              status === "success" ? "text-green-600" : status === "error" ? "text-red-500" : "text-gray-400"
            }`}
          >
            {message || (status === "idle" ? "拖动滑块验证" : "")}
          </span>
        </div>

        {status !== "success" && (
          <button
            type="button"
            onClick={fetchCaptcha}
            disabled={status === "loading"}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${status === "loading" ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            <span>换一张</span>
          </button>
        )}
      </div>
    </div>
  );
}
