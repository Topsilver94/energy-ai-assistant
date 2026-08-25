/**
 * 轻量警示提示（表单校验等）：底部居中 pill，amber 为唯一例外色、仅警示语义
 * 由父组件控制 message，空字符串时不渲染
 */
export default function Toast({ message }) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber/40 bg-ink-raised px-4 py-2 text-[13px] font-medium text-amber shadow-lg"
    >
      {message}
    </div>
  )
}
