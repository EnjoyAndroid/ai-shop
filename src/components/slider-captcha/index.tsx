"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface SliderCaptchaProps {
  onSuccess: (token: string) => void;
  onError?: (message: string) => void;
}

interface CaptchaState {
  token: string;
  image: string; // 服务端渲染，响应不包含答案坐标
  config: {
    width: number;
    height: number;
    sliderSize: number;
  };
}

export default function SliderCaptcha({ onSuccess, onError }: SliderCaptchaProps) {
  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [sliderX, setSliderX] = useState(0);
  const [renderWidth, setRenderWidth] = useState(300);
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
    if (!containerRef.current || !captcha) return;
    const updateWidth = () => {
      const width = Math.max(1, containerRef.current!.clientWidth - 2);
      setRenderWidth(width);
      sliderWidthRef.current = width * (1 - captcha.config.sliderSize / captcha.config.width);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
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
          position: Math.round(sliderX * captcha.config.width / renderWidth),
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
  }, [captcha, sliderX, renderWidth, onSuccess, onError, fetchCaptcha]);

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
          <span className="text-sm">{status === "error" ? message : "加载验证码..."}</span>
          {status === "error" && <button type="button" onClick={fetchCaptcha} className="text-primary">重试</button>}
        </div>
      </div>
    );
  }

  const { config } = captcha;

  return (
    <div className="w-full max-w-[320px] select-none" ref={containerRef}>
      {/* 主容器 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {/* 背景图区域 */}
        <div
          className="relative overflow-hidden"
          style={{ width: "100%", height: config.height }}
        >
          {/* 验证图包含缺口；位置只保存在服务端 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captcha.image} alt="拖动滑块到图片缺口" width={config.width} height={config.height} className="absolute inset-0 w-full h-full" draggable={false} />

          {/* 可拖动滑块 */}
          <div
            className={`absolute rounded-lg cursor-grab ${
              isDragging ? "cursor-grabbing" : ""
            } ${status === "success" ? "ring-2 ring-green-400 ring-offset-1" : ""}`}
            style={{
              width: config.sliderSize * renderWidth / config.width,
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
