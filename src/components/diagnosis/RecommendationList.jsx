import { ArrowDownToLine } from 'lucide-react'
import Button from '../ui/Button'

// level 徽章：推荐=亮绿（选中态语义），可考虑=灰，谨慎=amber（唯一警示色）。
// 导出供模块② 方案比选表复用同一套色——同一 level 在两处必须同色，不做第二份映射
export const LEVEL_TONES = {
  推荐: 'border-volt/50 bg-volt/10 text-volt',
  可考虑: 'border-line bg-ink-raised text-paper-mute',
  谨慎: 'border-amber/40 bg-amber/10 text-amber',
}

/**
 * 方案配置推荐列表（规则引擎输出，每条附触发依据）。
 * 「填入模块② 测算」为覆盖式操作，只写入 level 推荐/可考虑 的系统
 * （见 projectStore.applyRecommendation）。流程上诊断在前、测算页多为空/旧值，
 * 误覆盖重建成本低，不设确认弹窗——单击即填入并跳转（演示模式 toast 反馈）。
 */
export default function RecommendationList({ recs, onApply }) {
  if (!recs || recs.length === 0) return null

  const adoptCount = recs.filter((r) => r.level === '推荐' || r.level === '可考虑').length

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">方案配置推荐</p>
        <span className="text-[11px] text-paper-mute/80">规则引擎 · 按匹配度降序 · 附触发依据</span>
      </div>

      {/* rec-* 语义钩子类：回归脚本按语义取数用（同 .report-doc 的既有做法），不参与样式 */}
      <div className="rec-list space-y-2">
        {recs.map((rec, i) => (
          <div
            key={rec.key}
            className="rec-item rounded-lg border border-line bg-ink-raised px-3.5 py-2.5 transition-colors hover:border-line"
          >
            {/* 徽章与规模都是整体单位：窄列（演示模式）挤不下时整块换行，
                不让系统名被压成两行——故 flex-wrap + 各段 nowrap，
                规模块靠 ml-auto 在换行后仍贴右缘。
                不设置信度徽章：投资推荐程度由 level 徽章承载，而规模的数据支撑强度
                已由下方触发依据逐条写明（「需工艺负荷资料复核」等），徽章是重复表达 */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="tabular font-mono text-[13px] text-paper-mute">{i + 1}</span>
              <span className="rec-label whitespace-nowrap text-sm font-semibold text-paper">
                {rec.label}
              </span>
              <span
                className={`rec-level whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_TONES[rec.level]}`}
              >
                {rec.level}
              </span>
              <span className="rec-scale tabular ml-auto whitespace-nowrap font-mono text-[13px] text-paper">
                建议规模 {rec.suggestedScale}
                <span className="ml-0.5 text-[11px] text-paper-mute">{rec.scaleUnit}</span>
              </span>
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {rec.reasons.map((reason) => (
                <li key={reason} className="flex gap-1.5 text-[12px] leading-relaxed text-paper-mute">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-volt" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 单击即填入（覆盖式）：容器负责跳转 / toast 反馈 */}
      <div className="mt-3 flex items-center justify-end">
        <Button variant="primary" size="sm" onClick={() => onApply(recs)}>
          <ArrowDownToLine size={14} />
          填入模块② 测算（{adoptCount} 项推荐）
        </Button>
      </div>
    </div>
  )
}
