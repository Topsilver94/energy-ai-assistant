// 敏感性表（模块② 结果区）：数据全部来自 utils/sensitivity.js，纯展示、无 store
// 依赖（可独立 SSR 冒烟）。单元格两行制：主行 IRR，副行 回收期 + 相对基准偏差；
// 偏差优 = volt / 劣 = amber（§6 唯一警示色），跌破折现率的 IRR 数值转 amber。
const HEADERS = ['-20%', '-10%', '基准', '+10%', '+20%']
const GRID = 'grid grid-cols-[88px_repeat(5,minmax(0,1fr))]'

const paybackText = (p) =>
  p.paybackPeriod === 'N/A' || p.irr == null ? '—' : `${p.paybackPeriod.toFixed(1)} 年`

/**
 * @param {{ applicable: boolean, base: object, rows: Array, flat: Array,
 *           hurdle: number, summaryLines: string[] } | null} sensitivity
 *   buildSensitivity 的返回值；null（无可测算项）时整块不渲染
 */
export default function SensitivityTable({ sensitivity }) {
  if (!sensitivity) return null

  const { base, rows, flat, hurdle, summaryLines } = sensitivity

  // 组合净现金流非正：不适用提示卡（同空状态样式语言）
  if (!sensitivity.applicable) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-line p-3">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">敏感性分析</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-paper-mute">{summaryLines[0]}</p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">敏感性分析</p>
        <span className="text-[11px] text-paper-mute/80">单变量扰动 · 其他参数不变</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        {/* 表头 */}
        <div className={`${GRID} border-b border-line bg-ink-panel`}>
          <div className="px-2.5 py-2 text-[11px] uppercase tracking-widest text-paper-mute">
            变量
          </div>
          {HEADERS.map((h, i) => (
            <div
              key={h}
              className={`px-1 py-2 text-center font-mono text-[11px] ${
                i === 2 ? 'font-semibold text-paper' : 'text-paper-mute'
              }`}
            >
              {h}
            </div>
          ))}
        </div>

        {/* 数据行 */}
        {rows.map((row) => (
          <div key={row.key} className={`${GRID} border-b border-line/40 last:border-0`}>
            <div className="px-2.5 py-2.5">
              <p className="text-[13px] font-semibold text-paper">{row.label}</p>
              <p className="text-[10px] leading-tight text-paper-mute">{row.note}</p>
            </div>
            {row.points.map((p) => {
              const isBase = p.factor === 0
              const dead = p.irr == null || p.paybackPeriod === 'N/A'
              const broken = !dead && p.irr < hurdle
              const delta = dead ? null : (p.irr - base.irr) * 100
              return (
                <div
                  key={p.factor}
                  className={`flex flex-col items-center justify-center px-1 py-2 ${
                    isBase ? 'bg-ink-raised' : ''
                  }`}
                >
                  <span
                    className={`tabular font-mono text-[13px] ${
                      broken ? 'text-amber' : 'text-paper'
                    } ${isBase ? 'font-semibold' : ''}`}
                  >
                    {dead ? '—' : `${(p.irr * 100).toFixed(1)}%`}
                  </span>
                  <span
                    className={`tabular font-mono text-[10px] ${
                      dead
                        ? 'text-amber'
                        : delta > 0
                          ? 'text-volt'
                          : delta < 0
                            ? 'text-amber'
                            : 'text-paper-mute'
                    }`}
                  >
                    {dead
                      ? '现金流≤0'
                      : isBase
                        ? paybackText(p)
                        : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp · ${paybackText(p)}`}
                  </span>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {flat.length > 0 && (
        <p className="mt-1.5 text-[11px] text-paper-mute/80">
          不影响本组合（表中略去）：{flat.map((f) => f.label).join('、')}
        </p>
      )}

      {/* 结论行：确定性文字（与模块③ 注入同源） */}
      <ul className="mt-2 space-y-0.5">
        {summaryLines.map((line) => (
          <li key={line} className="flex gap-1.5 text-[12px] leading-relaxed text-paper-mute">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-volt" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  )
}
