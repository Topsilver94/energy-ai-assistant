import { X } from 'lucide-react'
import { PROJECT_TYPES, useProjectStore } from '../../stores/projectStore'

/**
 * 方案比选 A/B（模块② 结果区）：把两次测算的组合总账快照并排对比——售前高频
 * 「给我两个配置」的决策工具。数据全部来自 projectStore.plans 快照（存入时深拷贝，
 * 重测/改表单不串改）；Δ(A−B) 按有利方向着色（IRR/收益/碳减排高=优 volt，
 * 投资/回收期低=优），不利侧 amber——与敏感性表同一颜色纪律（§6 唯一警示色）。
 * 内部决策工具，不进打印报告（no-print）。
 */
// 比选摘要用短名（表头单元格内一行放下）
const SHORT = { pv: '光伏', storage: '储能', cooling: '供冷', charger: '充电桩' }

// Δ 行定义：key 取 feasibility.total 字段；better 声明有利方向；pp = 百分点口径
const ROWS = [
  { key: 'totalInvestment', label: '投资 · 万元', digits: 1, better: 'lower' },
  { key: 'annualRevenue', label: '年毛收益 · 万元', digits: 1, better: 'higher' },
  { key: 'irr', label: 'IRR', pp: true, digits: 1, better: 'higher' },
  { key: 'paybackPeriod', label: '回收期 · 年', digits: 1, better: 'lower' },
  { key: 'carbonReduction', label: '碳减排 · tCO₂/a', digits: 1, better: 'higher' },
]

const summaryOf = (plan) =>
  PROJECT_TYPES.filter(
    (t) => plan.inputs.systems[t.key]?.enabled && Number(plan.inputs.systems[t.key].capacity) > 0,
  )
    .map((t) => `${SHORT[t.key]} ${plan.inputs.systems[t.key].capacity}${t.scaleUnit}`)
    .join(' + ') || '（无有效系统）'

export default function PlanCompare() {
  const plans = useProjectStore((s) => s.plans)
  const feasibility = useProjectStore((s) => s.feasibility)
  const savePlan = useProjectStore((s) => s.savePlan)
  const clearPlan = useProjectStore((s) => s.clearPlan)

  const { A, B } = plans
  const both = Boolean(A && B)

  // 数值格式化：N/A / 非有限值如实显示「—」，不硬造数字
  const cell = (row, plan) => {
    const v = plan.feasibility.total[row.key]
    if (row.key !== 'annualRevenue' && !Number.isFinite(v)) return '—'
    if (v === 'N/A') return 'N/A'
    if (row.pp) return `${(v * 100).toFixed(row.digits)}%`
    return v.toFixed(row.digits)
  }
  const delta = (row) => {
    const a = A.feasibility.total[row.key]
    const b = B.feasibility.total[row.key]
    if (a === 'N/A' || b === 'N/A' || !Number.isFinite(a) || !Number.isFinite(b)) return null
    return row.pp ? (a - b) * 100 : a - b
  }
  const deltaText = (d, row) =>
    `${d > 0 ? '+' : ''}${d.toFixed(row.digits)}${row.pp ? 'pp' : ''}`

  const slotBtn = (slot) => {
    const saved = plans[slot]
    return (
      <span key={slot} className="flex items-center gap-1">
        <button
          type="button"
          disabled={!feasibility}
          onClick={() => savePlan(slot)}
          title={saved ? '再次点击覆盖该快照' : '保存当前测算结果为对比快照'}
          className={`rounded-full border px-3 py-1 text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-volt disabled:cursor-not-allowed disabled:opacity-40 ${
            saved
              ? 'border-volt/40 text-volt'
              : 'border-line text-paper-mute hover:border-paper-mute hover:text-paper'
          }`}
        >
          {saved ? `方案 ${slot} · 覆盖` : `存为方案 ${slot}`}
        </button>
        {saved && (
          <button
            type="button"
            onClick={() => clearPlan(slot)}
            title="清除该快照"
            aria-label={`清除方案 ${slot}`}
            className="rounded-full p-1 text-paper-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-volt"
          >
            <X size={12} strokeWidth={2.25} />
          </button>
        )}
      </span>
    )
  }

  return (
    <div className="no-print mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">方案比选</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {slotBtn('A')}
          {slotBtn('B')}
        </div>
      </div>

      {both ? (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[420px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-ink-raised text-[11px] uppercase tracking-widest text-paper-mute">
                <th className="sticky left-0 z-10 border-r border-line bg-ink-raised px-3 py-2 text-left font-semibold">
                  指标
                </th>
                {[A, B].map((p, i) => (
                  <th key={i} className="px-3 py-2 text-right font-semibold">
                    方案 {i === 0 ? 'A' : 'B'}
                    <span className="block font-mono text-[10px] font-normal normal-case tracking-normal text-paper-mute">
                      {summaryOf(p)}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-semibold">Δ(A−B)</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const d = delta(row)
                // Δ 着色：0 或不可比 → 中性灰；A 优 → volt；B 优 → amber（A 视角的劣向）
                const tone =
                  d == null || Math.abs(d) < 10 ** -(row.digits + 1)
                    ? 'text-paper-mute'
                    : (row.better === 'higher' ? d > 0 : d < 0)
                      ? 'text-volt'
                      : 'text-amber'
                return (
                  <tr
                    key={row.key}
                    className="group border-b border-line/40 transition-colors last:border-0 hover:bg-ink-hover"
                  >
                    <td className="sticky left-0 z-10 border-r border-line bg-ink-panel px-3 py-2 group-hover:bg-ink-hover">
                      {row.label}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-mono">{cell(row, A)}</td>
                    <td className="tabular px-3 py-2 text-right font-mono">{cell(row, B)}</td>
                    <td className={`tabular px-3 py-2 text-right font-mono ${tone}`}>
                      {d == null ? '—' : deltaText(d, row)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[12px] leading-relaxed text-paper-mute">
          {A || B
            ? `已存方案 ${(A ? 'A' : '') + (A && B ? '、' : '') + (B ? 'B' : '')}；再测一组配置存入另一槽位即可对比。`
            : '两次测算分别存入 A / B 槽位即可并排对比（投资 / 收益 / IRR / 回收期 / 碳减排）。'}
        </p>
      )}
    </div>
  )
}
