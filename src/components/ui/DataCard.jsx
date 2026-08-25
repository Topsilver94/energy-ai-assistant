/**
 * 数据卡（CLAUDE.md §6）：等宽大数字 + mute 小字全大写标签。
 * accent=true 时数值亮绿（用于最关键的一个指标，控制绿字面积占比）
 */
export default function DataCard({ icon: Icon, label, value, accent = false }) {
  return (
    <div className="rounded-lg border border-line bg-ink-raised p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-paper-mute">
        {Icon && <Icon size={14} />}
        {label}
      </div>
      <p
        className={`tabular mt-2 font-mono text-2xl font-semibold ${
          accent ? 'text-volt' : 'text-paper'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
