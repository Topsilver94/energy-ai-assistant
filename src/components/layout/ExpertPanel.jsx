import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { coefficientSections } from '../../data/coefficients'
import { benchmarkSection } from '../../data/benchmarks'
import { useConfigStore, buildDefaultConfig } from '../../stores/configStore'

import { getByPath, setByPath } from '../../utils/path'
import Button from '../ui/Button'

// 组内来源全一致时提升为组级展示（类目标题下方一条），字段行不再逐条重复；
// 部分一致的组保持逐字段。数据契约里每个字段仍带 source（红线不破）
const sharedSource = (section) => {
  const list = section.fields.map((f) => f.source)
  return list.every((x) => x === list[0]) ? list[0] : null
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
 * 配置抽屉（CLAUDE.md §5 配置中心的入口），一个组件按 scope 服务两个独立抽屉：
 *   scope='expert' 专家参数抽屉——系统可调系数（光伏/储能/集中供冷/充电桩）
 *   scope='public' 公开平台数据参考抽屉——分省/通用/基准，低频校准、对外参考展示
 * 两个抽屉各自由页头入口打开（一次只开一个），内容分组由契约里的 scope 字段决定。
 *
 * 交互模式：打开时把 store 配置拷为本地草稿 → 任意编辑（不即时生效）
 * → 「保存配置」一次性数值化并提交 store → 「恢复默认」仅重置草稿。
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
    setDraft(buildDefaultConfig()) // 仅重置草稿，保存后才生效
  }

  // ── 栏目索引：scrollspy + 点击定位 ──
  const scrollRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(0)

  // 滚动区顶缘命中的最后一个分组即为当前分组；贴底时锁定末组（末组较短时不再下滚的边界）
  const handleSpy = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
      setActiveIdx(sections.length - 1)
      return
    }
    const top = el.getBoundingClientRect().top
    let current = 0
    el.querySelectorAll('section[id^="expert-sec-"]').forEach((node, i) => {
      if (node.getBoundingClientRect().top <= top + 24) current = i
    })
    setActiveIdx(current)
  }, [sections])

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
      ?.querySelector(`#expert-sec-${i}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const fieldCount = sections.reduce((sum, s) => sum + s.fields.length, 0)

  // 抽屉身份：expert 可调系数；public 公开参考（低频校准，同样走保存生效）
  const meta =
    scope === 'public'
      ? {
          title: '公开平台数据参考',
          subtitle: `${fieldCount} 项公开参考数据 · 低频校准 · 保存后全局即时生效 · 灰字为数据来源`,
        }
      : {
          title: '专家参数',
          subtitle: `${fieldCount} 项可调系数 · 保存后全局即时生效 · 灰字为数据来源`,
        }

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

        {/* 分组表单（滚动区） */}
        <div ref={scrollRef} onScroll={handleSpy} className="flex-1 overflow-y-auto px-6 py-4">
          {sections.map((section, i) => {
            const shared = sharedSource(section)
            return (
            <section
              key={section.title}
              id={`expert-sec-${i}`}
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
              {/* 组级来源：组内 source 全一致时仅此一条，字段行不再逐条重复 */}
              {shared && (
                <p
                  className="mb-1 mt-1 line-clamp-2 text-[11px] leading-snug text-paper-mute/80"
                  title={shared}
                >
                  来源：{shared}
                </p>
              )}
              <div>
                {section.fields.map((field) => (
                  <div
                    key={field.path}
                    className="grid grid-cols-[1fr_162px] items-center gap-3 border-b border-line/40 py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-paper">{field.label}</p>
                      {!shared && (
                        <p
                          className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-paper-mute/80"
                          title={field.source}
                        >
                          {field.source}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step={field.step}
                        value={String(getByPath(draft, field.path) ?? '')}
                        onChange={(e) =>
                          setDraft((d) => setByPath(d, field.path, e.target.value))
                        }
                        className="tabular w-full rounded-xl bg-ink-raised px-3 py-1.5 text-right font-mono text-sm text-paper outline-none transition-shadow focus:ring-2 focus:ring-volt"
                      />
                      <span className="w-14 shrink-0 text-[11px] leading-tight text-paper-mute">
                        {field.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            )
          })}
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
