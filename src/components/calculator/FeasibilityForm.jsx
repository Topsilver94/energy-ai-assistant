import { Calculator, Check, Loader2 } from 'lucide-react'
import Button from '../ui/Button'
import { PROJECT_TYPES, useProjectStore } from '../../stores/projectStore'
import ProvincePicker from '../ui/ProvincePicker'

const inputClass =
  'w-full rounded-xl bg-ink-raised px-3 py-2.5 text-[15px] text-paper outline-none transition-shadow placeholder:text-paper-faint focus:ring-2 focus:ring-volt'

/**
 * 模块② 输入表单（组合测算）：系统多选卡片 + 各选中系统规模 + 共用省份
 * 输入绑定 projectStore.inputs.systems；测算与校验逻辑在父级 index.jsx。
 * 选中态纪律（CLAUDE.md §6）：亮绿描边 + 对勾点缀，不大面积铺色。
 */
export default function FeasibilityForm({ onSubmit, loading = false }) {
  const inputs = useProjectStore((s) => s.inputs)
  const setInput = useProjectStore((s) => s.setInput)
  const setSystem = useProjectStore((s) => s.setSystem)
  const toggleSystem = useProjectStore((s) => s.toggleSystem)
  const selected = PROJECT_TYPES.filter((t) => inputs.systems[t.key].enabled)

  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <label className="block">
        <span className="mb-1.5 block text-[13px] text-paper-mute">地点（省份）</span>
        <ProvincePicker value={inputs.province} onChange={(p) => setInput({ province: p })} />
      </label>

      {/* 系统多选卡片：综合能源方案按组合测算 */}
      <div>
        <span className="mb-1.5 block text-[13px] text-paper-mute">
          系统组合（多选）<span className="ml-1 text-paper-faint">已选 {selected.length} 项</span>
        </span>
        <div className="grid grid-cols-2 gap-2">
          {PROJECT_TYPES.map((t) => {
            const sys = inputs.systems[t.key]
            return (
              <button
                type="button"
                key={t.key}
                onClick={() => toggleSystem(t.key)}
                aria-pressed={sys.enabled}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  sys.enabled
                    ? 'border-volt bg-volt/10 text-paper'
                    : 'border-line bg-ink-raised text-paper-mute hover:text-paper'
                }`}
              >
                <span className="truncate">{t.label}</span>
                {sys.enabled && <Check size={15} strokeWidth={3} className="shrink-0 text-volt" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* 选中系统的规模输入：动态单位与占位 */}
      {selected.map((t) => (
        <label className="block" key={t.key}>
          <span className="mb-1.5 flex items-baseline justify-between text-[13px] text-paper-mute">
            {t.label} 规模
            <span className="font-mono text-[12px]">单位：{t.scaleUnit}</span>
          </span>
          <input
            type="number"
            min="0"
            step="any"
            placeholder={t.placeholder}
            value={inputs.systems[t.key].capacity}
            onChange={(e) => setSystem(t.key, { capacity: e.target.value })}
            className={`${inputClass} font-mono`}
          />
        </label>
      ))}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            测算中…
          </>
        ) : (
          <>
            <Calculator size={16} />
            开始测算
          </>
        )}
      </Button>
    </form>
  )
}
