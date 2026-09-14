import { useProjectStore } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useAiStore } from '../../stores/aiStore'

/**
 * 三步闭环元数据与完成态——工作模式书签（WorkNav）与演示模式书签（DemoNav）共用。
 * 单一事实源：两份清单各写一份迟早漂移（改标签只改一处、对勾数据源不一致）。
 */
export const STEPS = [
  { key: 'diag', index: '01', label: '挖掘痛点', hint: '对标基准定位节能空间' },
  { key: 'calc', index: '02', label: '锁定收益', hint: '组合测算投资与收益' },
  { key: 'report', index: '03', label: '订制方案', hint: '汇总①②输出一页方案' },
]

/**
 * 各步完成态（书签对勾的数据源）：① 已诊断 / ② 已测算 / ③ 已生成方案内容。
 * @returns {{ diag: boolean, calc: boolean, report: boolean }}
 */
export const useStepDone = () => {
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)
  const isReportDone = useAiStore((s) => s.reportContent.length > 0)
  return { diag: isDiagnosisDone, calc: isFeasibleDone, report: isReportDone }
}

/**
 * 演示模式步骤列的锚点 id 与报告滚动态 id（App 布局与 DemoNav 的契约，
 * 集中在此声明，避免「布局改了 id 但导航还在找旧 id」这类静默失效）。
 */
export const stepAnchorId = (key) => `demo-step-${key}`
// 报告卡内部滚动容器（AIReportPanel）：跳转 STEP③ 时需归零，保证从报告开头读起
export const REPORT_SCROLL_ID = 'report-scroll'
