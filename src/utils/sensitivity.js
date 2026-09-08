/**
 * 敏感性分析（模块②）—— 纯函数，单变量扰动重算组合总账（同 finance.js 口径）。
 *
 * 方法论：固定其他参数，对单一变量按 ±10% / ±20% 档位扰动，每档完整重跑
 * calculateFeasibility（含合并现金流 IRR / 静态回收期），检验结论稳健性。
 *   - 电价：光伏收益同向，集中供冷购电成本反向（交叉效应如实呈现）
 *   - 峰谷价差：仅影响储能套利收益（独立公开数据项，与电价轴解耦）
 *   - 利用小时：仅影响光伏发电量
 *   - 整体造价：四系统 capex 同比例变动（可研评审最常问的一轴）
 * 对当前组合无影响的轴（如未选光伏时的利用小时）判定为平坦轴，跳过展示并注明。
 * 结论行（summaryLines）为确定性文字，页面敏感性表与模块③ 注入共用同一份
 * （AI 仅润色措辞，不改数字——同 phasing.js / recommend.js 纪律）。
 */
import { calculateFeasibility } from './finance.js'

// 扰动档位（方法论常数，非财务系数）：±10% / ±20% 为可研敏感性常规档
const FACTORS = [-0.2, -0.1, 0, 0.1, 0.2]

const pct = (v) => `${(v * 100).toFixed(1)}%`

/** 分省参数扰动：只乘目标省的指定字段，其余 config 浅拷贝原样（省份缺失时回落首省，同 finance.js） */
const perturbProvince = (config, province, multipliers) => {
  const provKey = config.provinces[province] ? province : Object.keys(config.provinces)[0]
  return {
    ...config,
    provinces: {
      ...config.provinces,
      [provKey]: Object.fromEntries(
        Object.entries(config.provinces[provKey]).map(([k, v]) => [
          k,
          multipliers[k] ? v * multipliers[k] : v,
        ]),
      ),
    },
  }
}

/** 整体造价扰动：四系统 capex 同比例（运维比例等其余系数不动） */
const scaleAllCapex = (config, factor) => ({
  ...config,
  pv: { ...config.pv, capexPerWatt: config.pv.capexPerWatt * (1 + factor) },
  storage: { ...config.storage, capexPerKWh: config.storage.capexPerKWh * (1 + factor) },
  cooling: { ...config.cooling, capexPerSqm: config.cooling.capexPerSqm * (1 + factor) },
  charger: { ...config.charger, capexPerPile: config.charger.capexPerPile * (1 + factor) },
})

// 轴定义：label 展示名 / note 表内短注 / perturb 返回扰动后的 config
const AXES = [
  {
    key: 'elecPrice',
    label: '电价',
    note: '同向收益 · 反向成本',
    perturb: (config, province, f) => perturbProvince(config, province, { elecPrice: 1 + f }),
  },
  {
    key: 'peakValleySpread',
    label: '峰谷价差',
    note: '仅影响储能',
    perturb: (config, province, f) => perturbProvince(config, province, { peakValleySpread: 1 + f }),
  },
  {
    key: 'sunHours',
    label: '利用小时',
    note: '仅影响光伏',
    perturb: (config, province, f) => perturbProvince(config, province, { sunHours: 1 + f }),
  },
  {
    key: 'capex',
    label: '整体造价',
    note: '四系统同比',
    perturb: (config, province, f) => scaleAllCapex(config, f),
  },
]

/** 单档重算：形状异常按该档无解（null）处理，不让整表崩溃 */
const solve = (systems, province, demand, config) => {
  try {
    const r = calculateFeasibility({ systems, province, demand }, config)
    if (!r) return null
    return { irr: r.total.irr, paybackPeriod: r.total.paybackPeriod }
  } catch {
    return null
  }
}

/** 档位取值签名（平坦轴判定用）：无解或净现金流非正归 'na'，否则数值拼接 */
const sigOf = (p) =>
  p == null || p.irr == null || p.paybackPeriod === 'N/A'
    ? 'na'
    : `${p.irr.toFixed(6)}|${p.paybackPeriod.toFixed(6)}`

/**
 * @param {{ systems: Object, province: string, demand?: object|null }} params 与 calculateFeasibility 同形
 *   （demand 为模块① 需量推定快照——储能需量收益在各扰动档位中同口径参与重算）
 * @param {object} config configStore 纯数值配置
 * @returns {{ applicable: boolean, base: {irr, paybackPeriod}, rows: Array, flat: Array,
 *            hurdle: number, summaryLines: string[] } | null} 无可测算项时返回 null
 */
export const buildSensitivity = ({ systems, province, demand }, config) => {
  const base = solve(systems, province, demand, config)
  if (!base) return null

  // 组合年净现金流非正（回收期 N/A）时 IRR 恒报 0 口径失真，敏感性不适用
  if (base.paybackPeriod === 'N/A') {
    return {
      applicable: false,
      base,
      rows: [],
      flat: [],
      hurdle: config.general.discountRate,
      summaryLines: ['组合年净现金流非正（静态回收期 N/A），敏感性分析不适用'],
    }
  }

  const rows = []
  const flat = []
  for (const axis of AXES) {
    const points = FACTORS.map((factor) => ({
      factor,
      ...solve(systems, province, demand, axis.perturb(config, province, factor)),
    }))
    // 平坦轴：所有档位与基准同签名 → 对本组合无影响
    if (points.every((p) => sigOf(p) === sigOf(base))) {
      flat.push({ key: axis.key, label: axis.label })
      continue
    }
    // IRR 最大波幅（百分点）：敏感度排序依据；无解档位不计
    const swing = Math.max(
      ...points.map((p) => (p.irr == null || p.paybackPeriod === 'N/A' ? 0 : Math.abs(p.irr - base.irr) * 100)),
    )
    rows.push({ key: axis.key, label: axis.label, note: axis.note, points, swing })
  }

  const hurdle = config.general.discountRate
  // 跌破折现率的档位（全轴统计，含基准本身，如实计数）
  const below = rows.flatMap((row) =>
    row.points
      .filter((p) => p.irr != null && p.paybackPeriod !== 'N/A' && p.irr < hurdle)
      .map((p) => ({ label: row.label, factor: p.factor, irr: p.irr })),
  )

  // 敏感度降序（结论行排序与「最敏感」判定）
  const ranked = [...rows].sort((a, b) => b.swing - a.swing)

  const summaryLines = ranked.map((row) => {
    const nums = row.points
      .map((p) => (p.irr != null && p.paybackPeriod !== 'N/A' ? p.irr : null))
      .filter((v) => v != null)
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    const hasNa = row.points.some((p) => p.irr == null || p.paybackPeriod === 'N/A')
    return (
      `${row.label}：IRR ${pct(min)} ～ ${pct(max)}（基准 ${pct(base.irr)}，最大波幅 ${row.swing.toFixed(1)}pp）` +
      (hasNa ? '；存在现金流非正档位' : '')
    )
  })
  if (flat.length > 0) {
    summaryLines.push(`不影响本组合：${flat.map((f) => f.label).join('、')}`)
  }
  summaryLines.push(
    base.irr < hurdle
      ? `最敏感变量 ${ranked[0]?.label ?? '—'}；基准 IRR ${pct(base.irr)} 已低于折现率 ${pct(hurdle)}，项目本身未达基准收益`
      : below.length > 0
        ? `最敏感变量 ${ranked[0]?.label ?? '—'}；警示：${below.length} 个档位 IRR 跌破折现率 ${pct(hurdle)}（最低 ${pct(Math.min(...below.map((b) => b.irr)))}）`
        : `最敏感变量 ${ranked[0]?.label ?? '—'}；全部扰动档位 IRR 均不低于折现率 ${pct(hurdle)}`,
  )

  return { applicable: true, base, rows, flat, hurdle, summaryLines }
}
