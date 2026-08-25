import { Fragment } from 'react'
import { Check } from 'lucide-react'
import { useProjectStore } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useAiStore } from '../../stores/aiStore'

/**
 * 底部进度状态条：三步闭环的实时状态（① 速算 → ② 诊断 → ③ 方案）
 * 完成态 = 亮绿圆点 + 对勾；进度计数用等宽数字
 * 第三步完成 = 模块③ 已生成方案内容（aiStore.reportContent）
 */
export default function StepNav() {
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)
  const isReportDone = useAiStore((s) => s.reportContent.length > 0)

  const steps = [
    { label: '锁定收益', done: isFeasibleDone },
    { label: '挖掘痛点', done: isDiagnosisDone },
    { label: '订制方案', done: isReportDone },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <footer className="no-print border-t border-line bg-ink-panel">
      {/* lg 以上右侧预留宽度，避让右下角固定的模式切换键 */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 py-4 pl-6 pr-6 lg:pr-56">
        <div className="flex items-center gap-2">
          {steps.map((step, i) => (
            <Fragment key={step.label}>
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                    step.done
                      ? 'border-volt bg-volt text-ink'
                      : 'border-line text-paper-faint'
                  }`}
                >
                  {step.done ? (
                    <Check size={12} strokeWidth={3.5} />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-paper-faint" />
                  )}
                </span>
                <span
                  className={`text-[13px] ${step.done ? 'text-paper' : 'text-paper-mute'}`}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-line" />}
            </Fragment>
          ))}
        </div>
        <div className="ml-auto font-mono text-[13px] text-paper-mute tabular">
          进度 <span className="font-semibold text-volt">{doneCount}</span> / 3
        </div>
      </div>
    </footer>
  )
}
