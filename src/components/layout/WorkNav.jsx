import { Check } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useAiStore } from '../../stores/aiStore'

/**
 * 工作模式「书签导航」：贴屏幕左缘的三枚书签（隐蔽常驻，不占布局）。
 * 收起态为黄金比例竖向矩形（44 × 71 px ≈ 1:1.618），整体居上（top-28，
 * 顶栏下方留出舒适距离）。悬浮 / 键盘聚焦时滑出完整标签信息
 * （标题 + 一句说明 + 完成对勾），点击切换分页。
 * 展开为纯 CSS 过渡（宽度 200ms + 文字淡入延迟 100ms），无 JS 状态；
 * 选中书签仅多探出 4px 并亮绿描边——绿色做指示不做铺色（§6 纪律）。
 */
const STEPS = [
  { key: 'diag', index: '01', label: '挖掘痛点', hint: '对标基准定位节能空间' },
  { key: 'calc', index: '02', label: '锁定收益', hint: '组合测算投资与收益' },
  { key: 'report', index: '03', label: '订制方案', hint: '汇总①②输出一页方案' },
]

export default function WorkNav({ active, onChange }) {
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)
  const isReportDone = useAiStore((s) => s.reportContent.length > 0)

  const doneMap = { calc: isFeasibleDone, diag: isDiagnosisDone, report: isReportDone }

  return (
    <nav
      aria-label="模块导航"
      className="no-print fixed left-0 top-28 z-30 flex flex-col gap-2"
    >
      {STEPS.map((s) => {
        const isActive = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex h-[71px] items-center overflow-hidden rounded-r-lg border border-l-0 pl-3 pr-4 text-left shadow-md backdrop-blur transition-all duration-200 ease-out hover:w-60 focus-visible:w-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-volt ${
              isActive
                ? 'w-12 border-volt bg-ink-raised/95'
                : 'w-11 border-line bg-ink-panel/95 hover:border-paper-mute hover:bg-ink-raised'
            }`}
          >
            <span className="flex items-center gap-3 whitespace-nowrap">
              <span
                className={`font-mono text-[12px] leading-none ${
                  isActive ? 'text-volt' : 'text-paper-mute'
                }`}
              >
                {s.index}
              </span>
              <span className="-translate-x-1 flex flex-col gap-1 opacity-0 delay-100 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100">
                <span className={`text-sm leading-none ${isActive ? 'font-semibold' : 'font-medium'} text-paper`}>
                  {s.label}
                </span>
                <span className="text-[11px] leading-none text-paper-mute">{s.hint}</span>
              </span>
              {doneMap[s.key] && (
                <Check
                  size={14}
                  strokeWidth={3}
                  className="ml-1 shrink-0 text-volt opacity-0 delay-100 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              )}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
