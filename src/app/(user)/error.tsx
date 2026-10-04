"use client";

export default function UserContentError({ reset }: { reset: () => void }) {
  return <div className="rounded-xl bg-white p-8 text-center">
    <p role="alert" className="mb-4 text-gray-600">页面内容暂时无法加载，请稍后重试。</p>
    <button type="button" onClick={reset} className="rounded-lg bg-primary px-5 py-2 text-white">重试</button>
  </div>;
}
