import { Check } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useAiStore } from '../../stores/aiStore'

/**
 * 移动端（<md）工作模式分页导航：悬浮书签（WorkNav）窄屏必然遮挡正文，
 * 故窄屏改渲染此横向三步胶囊（与 WorkNav 同文案/完成态/volt 选中语义），
 * 宽度不占内容、可点切换，替代 WorkNav 在手机上的切页能力。md 及以上隐藏。
 */
const TABS = [
  { key: 'diag', index: '01', label: '挖掘痛点' },
  { key: 'calc', index: '02', label: '锁定收益' },
  { key: 'report', index: '03', label: '订制方案' },
]

export default function WorkTabs({ active, onChange, className = '' }) {
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)
  const isReportDone = useAiStore((s) => s.reportContent.length > 0)

  const doneMap = { calc: isFeasibleDone, diag: isDiagnosisDone, report: isReportDone }

  return (
    <nav
      aria-label="模块导航（移动）"
      className={`no-print grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-ink-raised p-1.5 ${className}`}
    >
      {TABS.map((t) => {
        const isActive = t.key === active
        const done = doneMap[t.key]
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-[13px] transition-colors ${
              isActive
                ? 'bg-volt font-semibold text-ink'
                : 'text-paper-mute hover:bg-ink-raised hover:text-paper'
            }`}
          >
            <span
              className={`font-mono text-[11px] leading-none ${
                isActive ? 'text-ink/70' : 'text-paper-faint'
              }`}
            >
              {t.index}
            </span>
            <span className="truncate">{t.label}</span>
            {done &&
              (isActive ? (
                <Check size={14} strokeWidth={3} className="shrink-0 text-ink/80" />
              ) : (
                <Check size={14} strokeWidth={3} className="shrink-0 text-volt" />
              ))}
          </button>
        )
      })}
    </nav>
  )
}
