"use client";

import { useState, useRef, useCallback, useEffect, useId, type PointerEvent, type KeyboardEvent } from "react";
import { ArrowRight, Check, GripVertical, Loader2, RotateCw, ShieldCheck, X } from "lucide-react";

interface SliderCaptchaProps {
  onSuccess: (token: string) => void;
  onError?: (message: string) => void;
}

interface CaptchaState {
  token: string;
  image: string;
  piece: string;
  config: { width: number; height: number; sliderSize: number; sliderTop: number };
}

type Status = "loading" | "idle" | "verifying" | "success" | "error";
const HANDLE_WIDTH = 44;
const TRACK_PADDING = 4;

export default function SliderCaptcha({ onSuccess, onError }: SliderCaptchaProps) {
  const [captcha, setCaptcha] = useState<CaptchaState | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [travel, setTravel] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const dragRef = useRef<{ pointerId: number; startX: number; startProgress: number; travel: number } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const statusId = useId();
  const callbacks = useRef({ onSuccess, onError });
  callbacks.current = { onSuccess, onError };

  const moveTo = (value: number) => {
    const bounded = Math.max(0, Math.min(1, value));
    progressRef.current = bounded;
    setProgress(bounded);
  };

  const fetchCaptcha = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    busyRef.current = true;
    dragRef.current = null;
    setDragging(false);
    setCaptcha(null);
    setStatus("loading");
    moveTo(0);
    setMessage("");
    try {
      const response = await fetch("/api/captcha/generate", { method: "POST", signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "获取验证图片失败，请重试");
      if (!controller.signal.aborted) { setCaptcha(data); setStatus("idle"); }
    } catch (error) {
      if (!controller.signal.aborted) { setStatus("error"); setMessage(error instanceof Error ? error.message : "网络连接失败，请重试"); }
    } finally { if (!controller.signal.aborted) busyRef.current = false; }
  }, []);

  useEffect(() => {
    void fetchCaptcha();
    return () => { requestRef.current?.abort(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [fetchCaptcha]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => setTravel(Math.max(1, track.clientWidth - TRACK_PADDING * 2 - HANDLE_WIDTH));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const verify = async (value: number) => {
    if (!captcha || busyRef.current || status !== "idle") return;
    busyRef.current = true;
    setStatus("verifying");
    setMessage("正在验证…");
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/captcha/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ token: captcha.token, position: Math.round(value * (captcha.config.width - captcha.config.sliderSize)) }),
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !data.success) throw new Error(data.error || "没有对齐，请再试一次");
      setStatus("success");
      setMessage("验证成功");
      timerRef.current = setTimeout(() => callbacks.current.onSuccess(captcha.token), 350);
    } catch (error) {
      if (controller.signal.aborted) return;
      const text = error instanceof Error ? error.message : "验证请求失败，请重试";
      setStatus("error");
      setMessage(text);
      busyRef.current = false;
      callbacks.current.onError?.(text);
      timerRef.current = setTimeout(() => void fetchCaptcha(), 1400);
    }
  };

  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (status !== "idle" || busyRef.current || event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startProgress: progressRef.current, travel };
    setDragging(true);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) moveTo(drag.startProgress + (event.clientX - drag.startX) / drag.travel);
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pointerMove(event);
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (progressRef.current > 0) void verify(progressRef.current);
  };
  const cancelDrag = () => { if (dragRef.current) { dragRef.current = null; setDragging(false); moveTo(0); } };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!captcha || status !== "idle" || busyRef.current) return;
    if (["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) event.preventDefault();
    const step = (event.shiftKey ? 10 : 2) / (captcha.config.width - captcha.config.sliderSize);
    if (event.key === "ArrowLeft") moveTo(progressRef.current - step);
    if (event.key === "ArrowRight") moveTo(progressRef.current + step);
    if (event.key === "Home") moveTo(0);
    if (event.key === "End") moveTo(1);
    if (event.key === "Enter" || event.key === " ") void verify(progressRef.current);
  };

  const success = status === "success";
  const failed = status === "error";
  const pending = status === "loading" || status === "verifying";
  const label = message || (dragging || progress > 0 ? "对齐缺口后松开" : "向右拖动滑块");

  return (
    <div className="w-full max-w-[320px] select-none">
      <div className="relative overflow-hidden rounded-xl bg-slate-100 ring-1 ring-inset ring-slate-900/5" style={{ aspectRatio: "2 / 1" }}>
        {captcha ? <>
          {/* Only raster images are public; the target position stays on the server. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captcha.image} alt="山景拼图：将左侧拼图移到图片缺口" width={captcha.config.width} height={captcha.config.height}
            className="absolute inset-0 h-full w-full" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captcha.piece} alt="" draggable={false} className="absolute drop-shadow-[0_2px_3px_rgba(15,23,42,0.4)]"
            style={{ width: `${captcha.config.sliderSize / captcha.config.width * 100}%`, height: `${captcha.config.sliderSize / captcha.config.height * 100}%`,
              top: `${captcha.config.sliderTop / captcha.config.height * 100}%`, left: `${progress * (1 - captcha.config.sliderSize / captcha.config.width) * 100}%` }} />
          {success && <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/10">
            <span className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm"><Check size={17} />验证成功</span>
          </div>}
        </> : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
          {failed ? <ShieldCheck size={28} strokeWidth={1.5} /> : <Loader2 size={24} className="animate-spin" />}
          <span className="text-xs">{failed ? "图片加载失败" : "正在准备验证图片…"}</span>
        </div>}
      </div>

      <div ref={trackRef} className={`relative mt-4 h-14 overflow-hidden rounded-xl border transition-colors ${success ? "border-emerald-200 bg-emerald-50" : failed ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
        <div className={`absolute inset-y-0 left-0 ${success ? "bg-emerald-100/70" : failed ? "bg-red-100/70" : "bg-blue-100/70"}`}
          style={{ width: progress > 0 ? progress * travel + HANDLE_WIDTH + TRACK_PADDING : 0 }} />
        <span aria-hidden="true" className={`absolute inset-0 flex items-center justify-center pl-9 text-xs transition-opacity ${dragging ? "opacity-0" : "opacity-100"} ${success ? "text-emerald-700" : failed ? "text-red-600" : "text-slate-500"}`}>
          {pending ? (status === "loading" ? "加载中…" : "正在验证…") : success ? "验证成功" : failed ? "请重试" : progress > 0 ? "对齐后按回车验证" : "向右拖动滑块"}
        </span>
        <button type="button" role="slider" aria-label="拖动拼图完成验证" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)} aria-valuetext={label} aria-describedby={statusId}
          aria-disabled={status !== "idle"} tabIndex={status === "idle" ? 0 : -1}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} onKeyDown={keyDown}
          className={`absolute left-1 top-1 flex h-11 w-11 touch-none items-center justify-center rounded-lg border shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${success ? "border-emerald-600 bg-emerald-600 text-white" : failed ? "border-red-500 bg-red-500 text-white" : dragging ? "cursor-grabbing border-blue-600 bg-blue-600 text-white" : "cursor-grab border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"}`}
          style={{ transform: `translateX(${progress * travel}px)` }}>
          {pending ? <Loader2 size={19} className="animate-spin" /> : success ? <Check size={20} /> : failed ? <X size={19} /> : dragging ? <GripVertical size={19} /> : <ArrowRight size={19} />}
        </button>
      </div>

      <div className="mt-3 flex min-h-6 items-start justify-between gap-3">
        <p id={statusId} role="status" aria-live="polite" className={`pt-1 text-xs leading-5 ${success ? "text-emerald-600" : failed ? "text-red-500" : "text-slate-400"}`}>
          {message || "拖动滑块，让拼图与缺口重合"}
        </p>
        {!success && <button type="button" onClick={() => void fetchCaptcha()} disabled={pending || dragging}
          className="-mr-1 flex shrink-0 items-center gap-1.5 rounded-md px-1 py-1 text-xs leading-5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
          aria-label="刷新验证图片"><RotateCw size={13} aria-hidden="true" />换一张</button>}
      </div>
    </div>
  );
}
