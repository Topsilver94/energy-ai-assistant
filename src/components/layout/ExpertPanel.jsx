import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { coefficientSections } from '../../data/coefficients'
import { benchmarkSection } from '../../data/benchmarks'
import { groupFieldsByInitial } from '../../data/provinceIndex'
import { useConfigStore, buildDefaultConfig } from '../../stores/configStore'

import { getByPath, setByPath } from '../../utils/path'
import Button from '../ui/Button'

// 来源整合（抽屉叙事约定：单项类型下的重复标注整合到类目下方，保持简洁叙事）：
//   1. 组内众数来源提升为组级一条（覆盖 ≥2 个字段才提升，全异组不硬提）；
//   2. 其余字段按「连续同来源」分段、段末一条，字段行只留标签与数值；
//   3. 分省组保持逐行平铺（兜底省与真实数据省交错，逐行标注是刻意为之），
//      仅把众数来源收编组级、偏离众数的行保留行级来源。
// 数据契约里每个字段仍带 source（红线不破）
const dominantSource = (fields) => {
  let best = { source: null, n: 0 }
  const seen = new Map()
  fields.forEach((f) => {
    const n = (seen.get(f.source) ?? 0) + 1
    seen.set(f.source, n)
    if (n > best.n) best = { source: f.source, n } // 严格大于：并列取先出现者
  })
  return best.n >= 2 ? best.source : null
}

// 连续同来源分段（非分省组）：[{ source, rows }]，rows 为该段字段行
const segmentRows = (rows) => {
  const segs = []
  rows.forEach((row) => {
    const last = segs[segs.length - 1]
    if (last && last.source === row.field.source) last.rows.push(row)
    else segs.push({ source: row.field.source, rows: [row] })
  })
  return segs
}

// 数值化：输入框存的是字符串，保存时转数字；非法/空值回退为当前 store 值
const toNumeric = (value, fallback) => {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : fallback
}

// 以 ref（当前 config）为骨架递归数值化，保证结构与键完整、无 NaN 进入公式
const numericize = (obj, ref) => {
  const out = {}
  Object.keys(ref).forEach((key) => {
    out[key] =
      typeof ref[key] === 'number'
        ? toNumeric(obj?.[key], ref[key])
        : numericize(obj?.[key] ?? {}, ref[key])
  })
  return out
}

/**
 * 配置抽屉（CLAUDE.md §5 配置中心的入口），一个组件按 scope 服务三个独立抽屉：
 *   scope='expert'    专家参数抽屉——系统可调系数与财务假设（光伏/储能/集中供冷/充电桩/通用财务）
 *   scope='power'     电力市场数据抽屉——分省电价/峰谷价差/分时结构/利用小时 + 电网排放因子，
 *                     动态公开数据、随月度/季度换版（AS_OF 常量）
 *   scope='reference' 工程估算参考抽屉——按建筑类型查表的经验参考（屋面/供冷折算/配建/
 *                     储能定容与需量/电耗预估/对标基准），方案阶段估算
 * 三个抽屉各自由页头入口打开（一次只开一个），内容分组由契约里的 scope 字段决定。
 *
 * 交互模式：打开时把 store 配置拷为本地草稿 → 任意编辑（不即时生效）
 * → 「保存配置」一次性数值化并提交 store → 「恢复默认」仅重置本抽屉字段的草稿
 * （其他抽屉的当前值不受影响；全局还原 = 逐抽屉分别恢复）。
 * 原子提交避免半份数据触发重算。
 */
export default function ExpertPanel({ open, onClose, scope = 'expert' }) {
  const config = useConfigStore((s) => s.config)
  const updateConfig = useConfigStore((s) => s.updateConfig)

  const [draft, setDraft] = useState(config)

  // 面板数据契约：系数分组 + 建筑基准分组，按 scope 取本抽屉的分组
  const allSections = useMemo(() => [...coefficientSections, benchmarkSection], [])
  const sections = useMemo(
    () => allSections.filter((s) => s.scope === scope),
    [allSections, scope],
  )

  // 每次打开重新同步草稿，放弃上次未保存的编辑
  useEffect(() => {
    if (open) setDraft(config)
  }, [open, config])

  // Esc 关闭 + 打开期间锁定背景滚动
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const handleSave = () => {
    updateConfig(numericize(draft, config))
    onClose()
  }

  const handleReset = () => {
    // 分抽屉恢复默认：仅重置本抽屉字段的草稿值，其他抽屉的当前值不受影响——
    // 心智模型「抽屉即编辑范围」；需要全局还原时逐抽屉分别恢复（保存后生效，同交互模式）
    const defaults = buildDefaultConfig()
    setDraft((d) =>
      sections.reduce(
        (acc, s) => s.fields.reduce((a, f) => setByPath(a, f.path, getByPath(defaults, f.path)), acc),
        d,
      ),
    )
  }

  // ── 栏目索引：scrollspy + 点击定位 ──
  const scrollRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [activeLetter, setActiveLetter] = useState(null)

  // 滚动区顶缘命中的最后一个分组即为当前分组；贴底时锁定末组（末组较短时不再下滚的边界）。
  // 分省组内同步测算当前首字母（最后一个越过顶缘的字母头），驱动右缘索引条高亮
  const handleSpy = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      setActiveIdx(sections.length - 1)
      return
    }
    const top = el.getBoundingClientRect().top
    let current = 0
    el.querySelectorAll(`section[id^="expert-sec-${scope}-"]`).forEach((node, i) => {
      if (node.getBoundingClientRect().top <= top + 24) current = i
    })
    setActiveIdx(current)
    let letter = null
    el.querySelectorAll(`[id^="expert-letter-${scope}-"]`).forEach((node) => {
      if (node.getBoundingClientRect().top <= top + 24) letter = node.id.split('-').pop()
    })
    setActiveLetter(letter)
  }, [sections, scope])

  // 打开时按保留的滚动位置初始化高亮（rAF 等布局稳定后再测量）
  useEffect(() => {
    if (!open) return undefined
    const id = window.requestAnimationFrame(handleSpy)
    return () => window.cancelAnimationFrame(id)
  }, [open, handleSpy])

  // 点击定位：索引条在滚动区外，block:'start' 使分组顶缘（绿色分界线）贴住索引条下沿，
  // 标题紧随其下刚好出现在索引条下方
  const jumpTo = (i) => {
    setActiveIdx(i)
    scrollRef.current
      ?.querySelector(`#expert-sec-${scope}-${i}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // 首字母定位：目标为当前分省组内该字母的首省行（非分省组时索引条不渲染，不会触发）
  const jumpToLetter = (letter) => {
    setActiveLetter(letter)
    scrollRef.current
      ?.querySelector(`#expert-letter-${scope}-${activeIdx}-${letter}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const fieldCount = sections.reduce((sum, s) => sum + s.fields.length, 0)

  // 分省首字母索引：抽屉含分省组时滚动区右缘让位；索引条数据取当前分省组的字母分组
  const hasIndexed = sections.some((s) => s.indexed)
  const railGroups = sections[activeIdx]?.indexed
    ? groupFieldsByInitial(sections[activeIdx].fields)
    : null

  // 抽屉身份（scope → 标题与副题；未知 scope 兜底 expert，同 prop 默认值）
  const drawerMeta = {
    expert: {
      title: '专家参数',
      subtitle: `${fieldCount} 项可调系数 · 保存后全局即时生效 · 灰字为数据来源`,
    },
    power: {
      title: '电力市场数据',
      subtitle: `${fieldCount} 项公开数据 · 按月/季/年分层更新（见各分组说明）· 保存后全局即时生效`,
    },
    reference: {
      title: '工程估算参考',
      subtitle: `${fieldCount} 项查表参考 · 方案阶段估算 · 保存后全局即时生效 · 灰字为数据来源`,
    },
  }
  const meta = drawerMeta[scope] ?? drawerMeta.expert

  return (
    <>
      {/* 背景遮罩：从 Header 下沿开始（top-16），保证顶栏入口在抽屉打开时仍可点
          （两抽屉互斥切换路径不被物理遮挡） */}
      <div
        className={`no-print fixed inset-x-0 top-16 bottom-0 z-40 bg-black/60 transition-opacity duration-300 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`no-print fixed right-0 top-16 z-50 flex h-[calc(100%-4rem)] w-[min(480px,92vw)] flex-col border-l border-line bg-ink-panel transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={`${meta.title}配置`}
      >
        {/* 抽屉头 */}
        <div className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="text-lg font-bold">{meta.title}</h3>
            <p className="mt-0.5 text-[12px] text-paper-mute">{meta.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-2 text-paper-mute transition-colors hover:bg-ink-raised hover:text-paper"
          >
            <X size={18} />
          </button>
        </div>

        {/* 栏目索引：固定在滚动区外（零空隙贴抽屉头），点击定位 + scrollspy 高亮当前分组 */}
        <div className="flex flex-wrap gap-1.5 border-b border-line/60 px-6 py-2.5">
          {sections.map((section, i) => (
            <button
              key={section.title}
              type="button"
              onClick={() => jumpTo(i)}
              className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                i === activeIdx
                  ? 'border-volt/60 bg-volt/10 font-medium text-volt'
                  : 'border-line text-paper-mute hover:border-paper-mute hover:text-paper'
              }`}
            >
              {section.title}
            </button>
          ))}
        </div>

        {/* 分组表单（滚动区，外包一层用于挂浮动索引条；含分省组时右缘留出索引条位） */}
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={handleSpy}
            className={`h-full overflow-y-auto py-4 ${hasIndexed ? 'pl-6 pr-12' : 'px-6'}`}
          >
            {sections.map((section, i) => {
              const dominant = dominantSource(section.fields)
              // 分省组：按拼音首字母分组，每组首行挂字母锚点（右缘索引条定位用，列表内不渲染字母头）
              const rows = section.indexed
                ? groupFieldsByInitial(section.fields).flatMap(({ letter, fields }) =>
                    fields.map((field, j) => ({
                      key: field.path,
                      field,
                      letter: j === 0 ? letter : null,
                    })),
                  )
                : section.fields.map((field) => ({ key: field.path, field }))
              return (
            <section
              key={section.title}
              id={`expert-sec-${scope}-${i}`}
              className="border-b border-volt/50 py-4 last:border-0"
            >
              {/* 分组题：比字段标签高一级（§6 字号阶梯），绿方标 + 绿分隔线双重锚点 */}
              <div className="flex items-center gap-2">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px] bg-volt" />
                <h4 className="text-base font-bold text-paper">{section.title}</h4>
              </div>
              {section.hint && (
                <p className="mb-1 mt-1 text-[12px] leading-relaxed text-paper-mute">
                  {section.hint}
                </p>
              )}
              {/* 组级来源：组内众数来源仅此一条（覆盖 ≥2 字段才提升）。
                  不加「来源：」前缀——来源句自带「演示假设值：」等定性词，重复前缀会叠出双重冒号 */}
              {dominant && (
                <p
                  className="mb-1 mt-1 line-clamp-2 text-[11px] leading-snug text-paper-mute/80"
                  title={dominant}
                >
                  {dominant}
                </p>
              )}
              <div>
                {section.indexed
                  ? // 分省组：逐行平铺，仅偏离众数来源的行（兜底省）保留行级标注
                    rows.map((row) => (
                      <div
                        key={row.key}
                        id={row.letter ? `expert-letter-${scope}-${i}-${row.letter}` : undefined}
                        className="grid grid-cols-[1fr_162px] items-center gap-3 border-b border-line/40 py-2.5 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-paper">{row.field.label}</p>
                          {row.field.source !== dominant && (
                            <p
                              className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-paper-mute/80"
                              title={row.field.source}
                            >
                              {row.field.source}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step={row.field.step}
                            value={String(getByPath(draft, row.field.path) ?? '')}
                            onChange={(e) =>
                              setDraft((d) => setByPath(d, row.field.path, e.target.value))
                            }
                            className="tabular w-full rounded-xl bg-ink-raised px-3 py-1.5 text-right font-mono text-sm text-paper outline-none transition-shadow focus:ring-2 focus:ring-volt"
                          />
                          <span className="w-14 shrink-0 text-[11px] leading-tight text-paper-mute">
                            {row.field.unit}
                          </span>
                        </div>
                      </div>
                    ))
                  : // 非分省组：连续同来源分段收编，段末一条来源（众数段已被组级行覆盖，不再重复）
                    segmentRows(rows).map((seg) => (
                      <div key={seg.rows[0].key}>
                        {seg.rows.map((row) => (
                          <div
                            key={row.key}
                            className="grid grid-cols-[1fr_162px] items-center gap-3 border-b border-line/40 py-2.5 last:border-0"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm text-paper">{row.field.label}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                step={row.field.step}
                                value={String(getByPath(draft, row.field.path) ?? '')}
                                onChange={(e) =>
                                  setDraft((d) => setByPath(d, row.field.path, e.target.value))
                                }
                                className="tabular w-full rounded-xl bg-ink-raised px-3 py-1.5 text-right font-mono text-sm text-paper outline-none transition-shadow focus:ring-2 focus:ring-volt"
                              />
                              <span className="w-14 shrink-0 text-[11px] leading-tight text-paper-mute">
                                {row.field.unit}
                              </span>
                            </div>
                          </div>
                        ))}
                        {seg.source !== dominant && (
                          <p
                            className="mb-2 line-clamp-2 text-[11px] leading-snug text-paper-mute/80"
                            title={seg.source}
                          >
                            {seg.source}
                          </p>
                        )}
                      </div>
                    ))}
              </div>
            </section>
            )
          })}
          </div>

          {/* 分省首字母索引条：浮动右缘（避开滚动条），点击定位当前分省组该字母的首省行；
              高亮随滚动联动，非分省组时整条隐藏 */}
          {railGroups && (
            <nav
              aria-label="省份首字母索引"
              className="absolute right-5 top-1/2 z-10 flex -translate-y-1/2 flex-col"
            >
              {railGroups.map(({ letter, fields }) => (
                <button
                  key={letter}
                  type="button"
                  title={fields.map((f) => f.label).join('、')}
                  onClick={() => jumpToLetter(letter)}
                  className={`w-5 rounded text-center font-mono text-[11px] leading-4 transition-colors ${
                    letter === activeLetter
                      ? 'bg-volt/10 font-medium text-volt'
                      : 'text-paper-mute hover:bg-ink-raised hover:text-paper'
                  }`}
                >
                  {letter}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* 抽屉脚：恢复默认（草稿级）+ 保存配置（提交 store） */}
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw size={14} />
            恢复默认
          </Button>
          <Button variant="primary" onClick={handleSave}>
            保存配置
          </Button>
        </div>
      </aside>
    </>
  )
}
