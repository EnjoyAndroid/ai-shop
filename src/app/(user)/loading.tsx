export default function Loading() {
  return (
    <div role="status" aria-label="正在加载页面内容" className="min-h-[420px] space-y-6">
      <span className="sr-only">正在加载页面内容…</span>
      <div aria-hidden="true" className="rounded-xl bg-white p-6 sm:p-8 motion-safe:animate-pulse">
        <div className="h-4 w-24 rounded bg-slate-100" />
        <div className="mt-5 h-9 w-40 rounded bg-slate-100" />
        <div className="mt-6 h-9 w-28 rounded bg-slate-100" />
      </div>
      <div aria-hidden="true" className="rounded-xl bg-white p-6 motion-safe:animate-pulse">
        <div className="mb-6 h-5 w-24 rounded bg-slate-100" />
        {[0, 1, 2].map(row => <div key={row} className="flex items-center justify-between border-t py-5">
          <div className="space-y-3"><div className="h-4 w-40 rounded bg-slate-100" /><div className="h-3 w-28 rounded bg-slate-100" /></div>
          <div className="h-5 w-16 rounded bg-slate-100" />
        </div>)}
      </div>
    </div>
  )
}
