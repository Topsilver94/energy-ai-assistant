import { useState } from 'react'
import { ArrowDownToLine, X } from 'lucide-react'
import Button from '../ui/Button'

// level 徽章：推荐=亮绿（选中态语义），可考虑=灰，谨慎=amber（唯一警示色），暂缓=灰弱
const LEVEL_TONES = {
  推荐: 'border-volt/50 bg-volt/10 text-volt',
  可考虑: 'border-line bg-ink-raised text-paper-mute',
  谨慎: 'border-amber/40 bg-amber/10 text-amber',
  暂缓: 'border-line bg-transparent text-paper-mute',
}

// 置信度：数据支撑强度的如实分级（title 悬浮说明依据）
const CONFIDENCE = {
  high: { label: '高', title: '面积/类型数据直接推导' },
  medium: { label: '中', title: '方向可推，规模需负荷数据修正' },
  verify: { label: '待确认', title: '类型代理推断，需车位/流量确认' },
}

/**
 * 方案配置推荐列表（规则引擎输出，每条附触发依据）。
 * 「填入 STEP1 测算」为覆盖式操作 → 两段式确认（首击变确认态，不用弹窗）：
 * 只写入 level 推荐/可考虑 的系统（见 projectStore.applyRecommendation）。
 */
export default function RecommendationList({ recs, onApply }) {
  const [confirming, setConfirming] = useState(false)
  if (!recs || recs.length === 0) return null

  const adoptCount = recs.filter((r) => r.level === '推荐' || r.level === '可考虑').length

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">方案配置推荐</p>
        <span className="text-[11px] text-paper-mute/80">规则引擎 · 按匹配度降序 · 附触发依据</span>
      </div>

      <div className="space-y-2">
        {recs.map((rec, i) => (
          <div
            key={rec.key}
            className="rounded-lg border border-line bg-ink-raised px-3.5 py-2.5 transition-colors hover:border-line"
          >
            <div className="flex items-center gap-2.5">
              <span className="tabular font-mono text-[13px] text-paper-mute">{i + 1}</span>
              <span className="text-sm font-semibold text-paper">{rec.label}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_TONES[rec.level]}`}
              >
                {rec.level}
              </span>
              <span
                className="rounded-full border border-line px-2 py-0.5 text-[11px] text-paper-mute"
                title={CONFIDENCE[rec.confidence].title}
              >
                {CONFIDENCE[rec.confidence].label}
              </span>
              <span className="tabular ml-auto font-mono text-[13px] text-paper">
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

      {/* 两段式确认：首击 → 确认覆盖；再击 → 应用并回调（模块容器负责 toast） */}
      <div className="mt-3 flex items-center justify-end gap-2">
        {confirming && (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            <X size={14} />
            取消
          </Button>
        )}
        {confirming ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setConfirming(false)
              onApply(recs)
            }}
          >
            确认覆盖当前选择？
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setConfirming(true)}>
            <ArrowDownToLine size={14} />
            填入 STEP1 测算（{adoptCount} 项推荐）
          </Button>
        )}
      </div>
    </div>
  )
}
