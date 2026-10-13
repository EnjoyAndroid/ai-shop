export function AdminContentLoading() {
  return <div role="status" aria-label="正在加载后台内容" className="min-h-[420px] space-y-6">
    <span className="sr-only">正在加载后台内容，请稍候。</span>
    <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
      <div className="h-8 w-44 rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className="h-28 rounded-xl bg-white" />)}</div>
      <div className="rounded-xl bg-white p-6"><div className="mb-6 h-5 w-28 rounded bg-gray-100" />{[0, 1, 2, 3].map(index => <div key={index} className="flex items-center justify-between border-t py-5"><div className="h-4 w-2/5 rounded bg-gray-100" /><div className="h-4 w-20 rounded bg-gray-100" /></div>)}</div>
    </div>
  </div>;
}
