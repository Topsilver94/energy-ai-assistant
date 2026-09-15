import { useMemo } from 'react'
import { PROJECT_TYPES, useProjectStore } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useConfigStore } from '../../stores/configStore'
import { recommendFromDiagnosis } from '../../utils/recommend'
import { calculateFeasibility } from '../../utils/finance'
import { LEVEL_TONES } from '../diagnosis/RecommendationList'

/**
 * 方案比选（模块② 结果区）：按模块① 的推荐自动生成配置档位，一档一行列账——
 * 售前高频「给我两个配置」的决策工具。
 *
 * 档位口径（自上而下＝读者关心的顺序）：
 * - 单项档：模块① 推荐列表里的每一项（含谨慎/暂缓），按其建议规模单独测算
 * - 当前配置档：直接复用已展示的组合总账（与上方数据卡同源），不重算，避免同一份配置
 *   在两处出现两个数；紧跟单项档，是用户此刻手上那份账。构成与省份都取那次测算的快照，
 *   表单改了未重测时不跟着变（旧数字不挂新规模/新省份）
 * - 合计档：上述各项按建议规模全上，IRR/回收期取各系统合并现金流；假想参照，置于末位
 *
 * 为什么档位不带优先级、不设 Δ 列、不做优劣着色：模块① 的 score 是四把不同量纲
 * 的尺子——光伏单调于装机规模、储能只有「价差过线与否 × 负荷平稳与否」四种取值、
 * 集中供冷由类型+面积门槛离散取值、充电桩同建筑类型下恒为常数（配 2 桩与配 200 桩
 * 同分）。它衡量的是「这类项目适不适合上这个系统」，与「这项投资划不划算」无关，
 * 拿它排序会得到一个几乎不随经济性变动的固定座次。故档位保持①列表原序，孰先孰后
 * 由用户读各档回收期/IRR 自行判断。合计档含谨慎/暂缓项，与「一键填入模块②」只采纳
 * 推荐/可考虑的口径不同——这是有意的：让客户看见「把谨慎项一并拉进来会怎样」。
 *
 * 内部决策工具，不进打印报告（no-print）。
 */
// 档位名/构成里的短名（一列内放得下）
const SHORT = { pv: '光伏', storage: '储能', cooling: '供冷', charger: '充电桩' }

// 列定义：key 取 feasibility.total 字段；pct = 百分数口径（IRR）
const COLS = [
  { key: 'totalInvestment', label: '投资 · 万元', digits: 1 },
  { key: 'annualRevenue', label: '年毛收益 · 万元', digits: 1 },
  { key: 'irr', label: 'IRR', pct: true, digits: 1 },
  { key: 'paybackPeriod', label: '回收期 · 年', digits: 1 },
  { key: 'carbonReduction', label: '碳减排 · tCO₂/a', digits: 1 },
]

// 数值格式化：N/A（IRR 无解 / 回收期不为正）与「—」（该档无有效系统）如实区分，不硬造数字
const fmt = (col, total) => {
  if (!total) return '—'
  const v = total[col.key]
  if (v === 'N/A') return 'N/A'
  if (!Number.isFinite(v)) return '—'
  if (col.pct) return `${(v * 100).toFixed(col.digits)}%`
  if (col.key === 'carbonReduction' && v <= 0) return '—'
  return v.toFixed(col.digits)
}

export default function PlanCompare() {
  const diagnosis = useDiagnosisStore((s) => s.diagnosis)
  const config = useConfigStore((s) => s.config)
  const projectInputs = useProjectStore((s) => s.inputs)
  const feasibility = useProjectStore((s) => s.feasibility)

  // 与模块① 结果区同一入口、同一 config ⇒ 档位与 STEP1 推荐列表逐字一致（无需入 store）
  const recs = useMemo(() => recommendFromDiagnosis(diagnosis, config), [diagnosis, config])

  // 当前配置的构成：取自「那次测算」的分项快照（feasibility.items），不是表单现值。
  // 该行的数字就是那次测算的，构成必须同源——否则表单改了规模还没重测时，会把新规模
  // 挂到旧数字上（省份已同样处理：口径行标的是 feasibility.province）。
  // 一系统一行：拼成一行时三四个系统会把「档位」列撑到最宽，短名+多行更省横向空间
  const activeParts = useMemo(() => {
    const byType = new Map((feasibility?.items ?? []).map((it) => [it.type, it.capacity]))
    return PROJECT_TYPES.filter((t) => byType.has(t.key)).map(
      (t) => `${SHORT[t.key]} ${byType.get(t.key)}${t.scaleUnit}`,
    )
  }, [feasibility])

  const rows = useMemo(() => {
    const out = recs.map((rec) => ({
      id: rec.key,
      name: `${rec.label} ${rec.suggestedScale}${rec.scaleUnit}`,
      level: rec.level,
      systems: { [rec.key]: { enabled: true, capacity: rec.suggestedScale } },
      // 需量快照只有储能消费——与① 热力图 estimateOf('storage', …, demand) 同口径，
      // 故单项档与合计档里的储能分项不会出现两个数
      demand: rec.key === 'storage' ? (rec.demand ?? null) : null,
    }))
    // 当前配置档：复用 store 里已展示的测算结果（须已测算且有有效系统）。
    // 置于单项档之后、合计档之前——再往下是假想的「全上」
    if (feasibility && activeParts.length > 0) {
      out.push({ id: '__active', name: '当前配置', sub: activeParts, total: true, useStoreResult: true })
    }
    // 合计档：仅一项时与单项档重复，不出
    if (recs.length > 1) {
      out.push({
        id: '__all',
        name: `合计 · ${recs.length} 项全上`,
        total: true,
        systems: Object.fromEntries(
          recs.map((r) => [r.key, { enabled: true, capacity: r.suggestedScale }]),
        ),
        demand: recs.find((r) => r.key === 'storage')?.demand ?? null,
      })
    }
    return out
  }, [recs, feasibility, activeParts])

  // 各档测算：单项/合计档按① 诊断省份（与① 热力图同口径），当前配置档直取 store 结果
  const accounts = useMemo(() => {
    const province = diagnosis?.province ?? projectInputs.province
    return rows.map((row) => {
      if (row.useStoreResult) return feasibility
      try {
        return calculateFeasibility(
          { systems: row.systems, province, ...(row.demand ? { demand: row.demand } : {}) },
          config,
        )
      } catch {
        return null
      }
    })
  }, [rows, feasibility, config, diagnosis, projectInputs.province])

  // ① 未完成（或面积非法导致引擎返回空）→ 表里只剩「当前配置」一档：如实提示其余档位的来源，
  // 不假装档位齐备。此分支必然可达（本组件只在② 有测算结果时挂载）
  const hasRecs = recs.length > 0
  const diagProvince = diagnosis?.province ?? null
  // 当前配置档标注「那次测算实际用的省份」（feasibility.province），不是表单现值：
  // 「填入模块②」会改写表单省份而不重算，若按表单现值标注，会把广东测出的数字说成安徽的
  const activeProvince = feasibility?.province ?? projectInputs.province
  // 两处口径跨省则如实标出（①诊断省 ≠ 当前配置那次测算用的省）
  const crossProvince = Boolean(hasRecs && diagProvince && diagProvince !== activeProvince)
  const noteLead = hasRecs ? `各档规模取① 建议值，收益按① 诊断省份 ${diagProvince} 测算；` : ''
  const noteTail = hasRecs ? '；合计档收益取各系统合并现金流，非各单项加权' : ''

  return (
    <div className="no-print mt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">方案比选</p>
        <span className="text-[11px] text-paper-mute/80">
          档位由模块① 推荐自动生成 · 不含优先级主张
        </span>
      </div>

      {!hasRecs && (
        <p className="mb-2 text-[12px] leading-relaxed text-paper-mute">
          先完成模块① 挖掘痛点——届时此处按① 的推荐自动生成各单项档位（含谨慎/暂缓项）与合计档，
          逐档列出投资、年毛收益、回收期与碳减排，无需手工存快照。当前仅有模块② 自身的测算结果。
        </p>
      )}

      {/* 窄屏容器内横滑看全列；首列「档位」sticky 固定（同分项明细/敏感性表纪律） */}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="plan-compare w-full min-w-[600px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-ink-raised text-[11px] uppercase tracking-widest text-paper-mute">
              <th className="sticky left-0 z-10 border-r border-line bg-ink-raised px-3 py-2 text-left font-semibold">
                档位
              </th>
              <th className="px-3 py-2 text-right font-semibold">①等级</th>
              {COLS.map((col) => (
                <th key={col.key} className="px-3 py-2 text-right font-semibold">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const total = accounts[i]?.total
              // 合计/当前配置两档加分隔线与字重：上面各单项一组，下面汇总一组
              return (
                <tr
                  key={row.id}
                  className={`group transition-colors hover:bg-ink-hover ${
                    row.total ? 'border-t-2 border-line' : 'border-b border-line/40'
                  }`}
                >
                  <td
                    className={`sticky left-0 z-10 whitespace-nowrap border-r border-line bg-ink-panel px-3 py-2 group-hover:bg-ink-hover ${
                      row.total ? 'font-semibold text-paper' : 'text-paper'
                    }`}
                  >
                    {row.name}
                    {row.sub && (
                      <span className="mt-0.5 block font-mono text-[10px] font-normal leading-snug text-paper-mute">
                        {row.sub.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.level ? (
                      <span
                        className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LEVEL_TONES[row.level]}`}
                      >
                        {row.level}
                      </span>
                    ) : (
                      <span className="text-paper-mute">—</span>
                    )}
                  </td>
                  {COLS.map((col) => (
                    <td
                      key={col.key}
                      className={`tabular px-3 py-2 text-right font-mono ${
                        row.total ? 'text-paper' : 'text-paper-mute'
                      }`}
                    >
                      {fmt(col, total)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 口径说明：句子顺序跟表格行序（单项 → 当前配置 → 合计）；跨省时转 amber 警示 */}
      <p className={`mt-1.5 text-[11px] leading-relaxed ${crossProvince ? 'text-amber' : 'text-paper-mute'}`}>
        {noteLead}当前配置为模块② 上次测算结果（省份 {activeProvince}）
        {crossProvince && '——与其余档位跨省，仅可作量级参考'}
        {noteTail}。系统寿命不一，各档回收期宜与 IRR 同看
      </p>
    </div>
  )
}
