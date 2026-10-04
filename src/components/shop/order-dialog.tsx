"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function OrderDialog({ title, description, onClose, children }: { title: string; description?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}
      className={`w-[calc(100%-2rem)] rounded-2xl p-0 shadow-xl backdrop:bg-slate-900/35 backdrop:backdrop-blur-[2px] ${description ? "max-w-[384px]" : "max-w-md"}`}>
      <div className={`flex items-start justify-between px-6 ${description ? "pt-6 pb-1" : "border-b py-4"}`}>
        <div><h2 id={titleId} className="text-lg font-semibold text-gray-800">{title}</h2>
          {description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="关闭弹窗" className="-mt-1 -mr-2 rounded-lg p-2 text-gray-400 transition-colors hover:bg-slate-50 hover:text-gray-800">✕</button>
      </div>
      {children}
    </dialog>
  );
}
