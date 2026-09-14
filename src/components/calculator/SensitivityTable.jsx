// 敏感性表（模块② 结果区）：数据全部来自 utils/sensitivity.js，纯展示、无 store
// 依赖（可独立 SSR 冒烟）。单元格三行制：主行 IRR，副行两行 = 相对基准偏差（±pp）
// + 回收期，所有单元格统一三行保证 IRR 基线对齐；偏差优 = volt / 劣 = amber
// （§6 唯一警示色），回收期一律中性灰；跌破折现率的 IRR 数值转 amber。
const HEADERS = ['-20%', '-10%', '基准', '+10%', '+20%']
// min-w 420：副行拆两行后每列只需容纳「+x.xpp / y.y 年」；窄容器（演示模式三列）
// 由外层 overflow-x-auto 横滑收纳，滑动距离比 560 版减约三分之一；再窄会触发
// 中文副行（现金流≤0）折行、行高失控
const GRID = 'grid min-w-[420px] grid-cols-[88px_repeat(5,minmax(0,1fr))]'
// 变量列（首列）sticky：横滑时固定容器左缘、仅右侧 5 档数据滑动；底色取卡面
// ink-panel 不透明遮住滑过的单元格，右缘细分隔线区分固定区与滑动区
const STICKY = 'sticky left-0 z-10 border-r border-line bg-ink-panel'

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

      <div className="overflow-x-auto rounded-lg border border-line">
        {/* 表头 */}
        <div className={`${GRID} border-b border-line bg-ink-panel`}>
          <div
            className={`${STICKY} px-2.5 py-2 text-[11px] uppercase tracking-widest text-paper-mute`}
          >
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
            <div className={`${STICKY} px-2.5 py-2.5`}>
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
                  {/* 副行两行制：±pp 偏差着色（优 volt / 劣 amber），回收期中性灰 */}
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
                        ? '基准'
                        : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`}
                  </span>
                  <span className="tabular font-mono text-[10px] text-paper-mute">
                    {paybackText(p)}
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
