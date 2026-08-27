// volt #1ED760 的 RGB 分量：动态透明度需 inline style（Tailwind 无法 JIT 动态类名），
// 数值取自 tailwind.config 的 volt token，未引入新色（§6 单强调色纪律）
const VOLT_RGB = '30, 215, 96'

// 列定义：get 取值 / fmt 展示 / better 方向（low = 越短越好，色阶反向） / na 无数据判定
const COLS = [
  { key: 'score', label: '匹配度', get: (r) => r.score, fmt: (v) => String(v), better: 'high' },
  {
    key: 'irr',
    label: 'IRR',
    get: (r) => r.estimate?.irr,
    fmt: (v) => `${(v * 100).toFixed(1)}%`,
    better: 'high',
  },
  {
    key: 'payback',
    label: '回收期',
    get: (r) => r.estimate?.paybackPeriod,
    fmt: (v) => (v === 'N/A' ? '—' : `${v.toFixed(1)} 年`),
    better: 'low',
    na: (v) => v === 'N/A',
  },
  {
    key: 'carbon',
    label: '碳减排 t/a',
    get: (r) => r.estimate?.carbonReduction,
    fmt: (v) => (v > 0 ? v.toFixed(0) : '—'),
    better: 'high',
    na: (v) => !(v > 0),
  },
]

// 列内 min-max 归一化 → 色阶透明度 0.08~0.38；全列同值时取中性 0.5（不给虚假的优劣差）
const tintOf = (values, value, better) => {
  const nums = values.filter((v) => typeof v === 'number')
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  let t = max > min ? (value - min) / (max - min) : 0.5
  if (better === 'low') t = 1 - t
  return 0.08 + 0.3 * t
}

/**
 * 方案推荐热力图：4 系统 × 匹配度/IRR/回收期/碳减排 的投资价值矩阵。
 * 数据全部可溯源：匹配度 = 规则引擎评分，财务列 = 按建议规模单系统预估
 * （utils/recommend.js 调 calculateFeasibility）。色阶是列内相对比较而非绝对评级，
 * 口径说明（怎么读图）置于表格下方，图例保留在标题行右端。
 */
export default function ValueHeatmap({ recs }) {
  if (!recs || recs.length === 0) return null

  // 预计算每列的取值序列（供归一化）
  const colValues = COLS.map((col) => recs.map(col.get))

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">投资价值热力图</p>
        <span className="text-[11px] text-paper-mute/80">绿深 = 列内更优</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        {/* 表头 */}
        <div className="grid grid-cols-[88px_repeat(4,minmax(0,1fr))] border-b border-line bg-ink-panel">
          <div className="px-2.5 py-2 text-[11px] uppercase tracking-widest text-paper-mute">
            系统
          </div>
          {COLS.map((col) => (
            <div
              key={col.key}
              className="px-2 py-2 text-center text-[11px] uppercase tracking-widest text-paper-mute"
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* 数据行 */}
        {recs.map((rec) => (
          <div
            key={rec.key}
            className="grid grid-cols-[88px_repeat(4,minmax(0,1fr))] border-b border-line/40 last:border-0"
          >
            <div className="flex items-center px-2.5 py-2.5 text-[13px] font-semibold text-paper">
              {rec.label}
            </div>
            {COLS.map((col, colIdx) => {
              const value = col.get(rec)
              const isNa = col.na ? col.na(value) : value == null
              return (
                <div
                  key={col.key}
                  className={`flex items-center justify-center px-2 py-2.5 ${
                    isNa ? 'bg-ink-raised' : ''
                  }`}
                  style={
                    isNa
                      ? undefined
                      : { backgroundColor: `rgba(${VOLT_RGB}, ${tintOf(colValues[colIdx], value, col.better)})` }
                  }
                >
                  <span
                    className={`tabular font-mono text-[13px] ${isNa ? 'text-paper-mute' : 'text-paper'}`}
                  >
                    {isNa ? '—' : col.fmt(value)}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="mt-1.5 text-[11px] leading-relaxed text-paper-mute/80">
        色阶为列内相对比较（回收期越短越绿）；财务列按建议规模单系统预估，非组合总账。
      </p>
    </div>
  )
}
