import { Activity, Loader2 } from 'lucide-react'
import Button from '../ui/Button'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { benchmarkTypes } from '../../data/benchmarks.js'
import { recommendationRules } from '../../data/recommendationRules.js'
import { useConfigStore } from '../../stores/configStore'

// 典型屋面预选（推断逻辑，留规则表驱动）；屋面选项由 config 公开参考表 roof.types 派生
const TYPICAL_ROOF = recommendationRules.typicalRoof.values

// 建造年份滑杆范围（UI 边界，非计算系数）：上限取当前年份，跨年自动前滚（防腐化）
const YEAR_MIN = 1980
const YEAR_MAX = new Date().getFullYear()

const inputClass =
  'w-full rounded-xl bg-ink-raised px-3 py-2.5 text-[15px] text-paper outline-none transition-shadow placeholder:text-paper-faint focus:ring-2 focus:ring-volt'

/**
 * 模块① 输入表单：建筑性质（既有/新建）+ 面积 / 类型 / 省份
 * 既有另填：建造年份（滑杆）+ 年度电费；新建另填：设计能耗强度（可选，留空按约束值预估）
 * 省份用于读取分省电价（与模块②同一 config 数据源）
 */
export default function DiagnosisForm({ onSubmit, loading = false }) {
  const inputs = useDiagnosisStore((s) => s.inputs)
  const setInput = useDiagnosisStore((s) => s.setInput)
  const config = useConfigStore((s) => s.config)

  const provinces = Object.keys(config.provinces)
  const roofOptions = Object.keys(config.roof.types)
  const isNew = inputs.buildingNature === 'new'
  const benchmark = config.benchmarks[inputs.buildingType] ?? '—'

  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {/* 建筑性质分流：既有（默认）走电费对标，新建走设计校核 */}
      <div className="grid grid-cols-2 gap-1.5 rounded-full border border-line bg-ink-raised p-1">
        {[
          { key: 'existing', label: '既有建筑' },
          { key: 'new', label: '新建建筑' },
        ].map((n) => (
          <button
            key={n.key}
            type="button"
            onClick={() => setInput({ buildingNature: n.key })}
            className={`rounded-full px-3 py-1.5 text-[13px] transition-colors ${
              inputs.buildingNature === n.key
                ? 'bg-volt font-semibold text-ink'
                : 'text-paper-mute hover:text-paper'
            }`}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] text-paper-mute">建筑类型</span>
          <select
            value={inputs.buildingType}
            onChange={(e) => setInput({ buildingType: e.target.value, roofType: '' })}
            className={inputClass}
          >
            {benchmarkTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] text-paper-mute">地点（省份）</span>
          <select
            value={inputs.province}
            onChange={(e) => setInput({ province: e.target.value })}
            className={inputClass}
          >
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 flex items-baseline justify-between text-[13px] text-paper-mute">
            建筑面积 <span className="font-mono text-[12px]">单位：㎡</span>
          </span>
          <input
            type="number"
            min="0"
            step="any"
            placeholder="如 10000"
            value={inputs.area}
            onChange={(e) => setInput({ area: e.target.value })}
            className={`${inputClass} font-mono`}
          />
        </label>

        {isNew ? (
          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-[13px] text-paper-mute">
              设计能耗强度 <span className="font-mono text-[12px]">kWh/㎡·a</span>
            </span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={`留空按约束值 ${benchmark} 预估`}
              value={inputs.designIntensity}
              onChange={(e) => setInput({ designIntensity: e.target.value })}
              className={`${inputClass} font-mono`}
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1.5 flex items-baseline justify-between text-[13px] text-paper-mute">
              年度电费 <span className="font-mono text-[12px]">单位：万元</span>
            </span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="如 80"
              value={inputs.annualElectricityFee}
              onChange={(e) => setInput({ annualElectricityFee: e.target.value })}
              className={`${inputClass} font-mono`}
            />
          </label>
        )}
      </div>

      {/* 屋面类型（仅既有）：业主一眼可知的零成本信息，预选按建筑类型的典型值随类型切换 */}
      {!isNew && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-paper-mute">屋面类型</span>
            <select
              value={inputs.roofType || TYPICAL_ROOF[inputs.buildingType] || '平屋面'}
              onChange={(e) => setInput({ roofType: e.target.value })}
              className={inputClass}
            >
              {roofOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {isNew ? (
        <p className="text-[12px] leading-relaxed text-paper-mute">
          新建建筑无实际电费：填写设计强度输出
          <span className="text-paper"> 设计校核</span>
          （对比 GB/T 51161 约束值），留空则按约束值预估年能耗；节能潜力待投产后核算。
        </p>
      ) : (
        <label className="block pt-1">
          <span className="mb-1.5 flex items-baseline justify-between text-[13px] text-paper-mute">
            建造年份
            <span className="tabular font-mono text-[13px] text-paper">{inputs.year}</span>
          </span>
          <input
            type="range"
            min={YEAR_MIN}
            max={YEAR_MAX}
            step={1}
            value={inputs.year}
            onChange={(e) => setInput({ year: Number(e.target.value) })}
            className="w-full accent-volt"
          />
          <span className="mt-0.5 flex justify-between font-mono text-[11px] text-paper-faint">
            <span>{YEAR_MIN}</span>
            <span>{YEAR_MAX}</span>
          </span>
        </label>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            诊断中…
          </>
        ) : (
          <>
            <Activity size={16} />
            开始诊断
          </>
        )}
      </Button>
    </form>
  )
}
