import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useConfigStore } from '../../stores/configStore'
import { groupFieldsByInitial, provinceInitial } from '../../data/provinceIndex'

/**
 * 省份索引栏选择器（与分省参数抽屉同构：字母分组 + 索引条）
 * 受控 { value: 省名, onChange }；数据源 = configStore.provinces 键（31 省级单位）。
 * 触发字段观感对齐表单 inputClass（rounded-xl bg-ink-raised + 聚焦 volt 描边）；
 * 展开浮层 = 字母索引条 + 当前字母组省份列表，点外部/选后关闭。
 * 分组复用 data/provinceIndex 纯函数（电力市场抽屉同一套）。
 */
export default function ProvincePicker({ value, onChange, className = '' }) {
  const provinces = Object.keys(useConfigStore((s) => s.config).provinces)
  const [open, setOpen] = useState(false)
  const [letter, setLetter] = useState(provinceInitial(value))
  const rootRef = useRef(null)

  const groups = groupFieldsByInitial(provinces.map((p) => ({ label: p })))
  const activeGroup = groups.find((g) => g.letter === letter)?.fields ?? []

  // 受控值变化同步字母回显（如经「一键填入」改写）
  useEffect(() => setLetter(provinceInitial(value)), [value])

  // 点击组件外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className={`relative w-full ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-ink-raised px-3 py-2.5 text-[15px] text-paper outline-none transition-shadow focus:ring-2 focus:ring-volt"
      >
        <span className="truncate">{value || '选择省份'}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-paper-mute transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-xl border border-line bg-ink-panel p-2 shadow-xl">
          {/* 字母索引条（同 ExpertPanel 索引条样式 token：当前字母 volt 高亮） */}
          <div className="mb-2 flex flex-wrap gap-0.5" role="tablist" aria-label="省份首字母索引">
            {groups.map((g) => (
              <button
                key={g.letter}
                type="button"
                role="tab"
                aria-selected={letter === g.letter}
                onClick={() => setLetter(g.letter)}
                className={`min-w-[22px] rounded px-1 py-0.5 text-center font-mono text-[12px] leading-4 transition-colors ${
                  letter === g.letter
                    ? 'bg-volt/10 font-semibold text-volt'
                    : 'text-paper-mute hover:bg-ink-raised hover:text-paper'
                }`}
              >
                {g.letter}
              </button>
            ))}
          </div>
          {/* 当前字母组的省列表 */}
          <ul
            role="listbox"
            aria-label="省份"
            className="grid max-h-56 grid-cols-3 gap-1 overflow-y-auto"
          >
            {activeGroup.map((f) => {
              const selected = f.label === value
              return (
                <li key={f.label}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(f.label)
                      setOpen(false)
                    }}
                    className={`w-full truncate rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                      selected
                        ? 'bg-volt font-semibold text-ink'
                        : 'text-paper hover:bg-ink-raised'
                    }`}
                  >
                    {f.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
