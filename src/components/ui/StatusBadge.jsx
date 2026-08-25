import { Check } from 'lucide-react'

/**
 * 步骤状态徽章：完成 = 亮绿（小面积点缀，不大面积铺色），未开始 = 灰
 * mode="locked" 用于模块③ 的依赖未解锁态
 */
export default function StatusBadge({ done = false, locked = false }) {
  if (done) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-volt/30 bg-volt/10 px-2.5 py-1 text-[11px] font-semibold text-volt">
        <Check size={12} strokeWidth={3} />
        已完成
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-ink-raised px-2.5 py-1 text-[11px] font-medium text-paper-mute">
      <span className="h-1.5 w-1.5 rounded-full bg-paper-faint" />
      {locked ? '未解锁' : '未开始'}
    </span>
  )
}
