import { useEffect } from 'react'
import { Fan, Gauge, Lightbulb, Star } from 'lucide-react'
import { useConfigStore } from '../../stores/configStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { calculateDiagnosis, getRecommendations, eraOf, pvMandatedHint } from '../../utils/diagnosis'
import { benchmarkTypes } from '../../data/benchmarks.js'
import RecommendationList from './RecommendationList'

// 措施 Chip 图标按序轮换（照明→Lightbulb，空调风机→Fan，监测→Gauge）
const CHIP_ICONS = [Lightbulb, Fan, Gauge]

// 能效评级徽章配色：优秀=亮绿，一般=灰，需改进=amber（唯一警示色）
const RATING_TONES = {
  优秀: 'border-volt/40 bg-volt/10 text-volt',
  一般: 'border-line bg-ink-raised text-paper-mute',
  需改进: 'border-amber/40 bg-amber/10 text-amber',
}

/**
 * 模块① 结果区：指标摘要 + 基准对比条 + 结论卡（既有=节能潜力/评级；新建=设计校核）
 * + 措施 Chips（既有）+ 方案配置推荐；投资价值热力图由容器（index）按布局放置
 *
 * 诊断快照附带 buildingType / year / area / province（计算当时的输入），
 * 结果展示只读快照，避免表单已切换类型而数字仍是旧类型的错位。
 * 监听 configStore：已有结果时，专家参数保存后自动重算（同模块② 联动模式）。
 */
export default function DiagnosisResults({ recs, onApply }) {
  const config = useConfigStore((s) => s.config)
  const diagnosis = useDiagnosisStore((s) => s.diagnosis)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)

  useEffect(() => {
    if (!isDiagnosisDone) return
    const { inputs, setDiagnosis } = useDiagnosisStore.getState()
    const result = calculateDiagnosis(inputs, config)
    if (result) {
      setDiagnosis({
        ...result,
        buildingType: inputs.buildingType,
        year: inputs.year,
        area: Number(inputs.area),
        province: inputs.province,
        roofType: inputs.roofType,
        transformerKva: inputs.transformerKva,
      })
    }
  }, [config, isDiagnosisDone])

  if (!diagnosis) {
    return (
      <div className="mt-5 rounded-lg border border-dashed border-line p-4">
        <p className="text-[11px] uppercase tracking-widest text-paper-mute">输出指标</p>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[13px] text-paper-faint">
          <span>年用电量 · 万kWh</span>
          <span>实际能耗 · kWh/㎡·a</span>
          <span>基准能耗 · kWh/㎡·a</span>
          <span>节能潜力 · %</span>
        </div>
      </div>
    )
  }

  const isNew = diagnosis.buildingNature === 'new'
  // 建成年代 → 标准代际侧重提示（确定性派生；新建/未填年份不展示）
  const era = isNew ? null : eraOf(diagnosis.year)
  const pvHint = era ? pvMandatedHint(diagnosis.year) : null
  const recommendations = isNew ? [] : getRecommendations(diagnosis.buildingType, diagnosis.savingPotential)
  const typeLabel =
    benchmarkTypes.find((b) => b.key === diagnosis.buildingType)?.label ?? diagnosis.buildingType

  // 对比条：以 max(采用强度, 基准) 归一化；虚线=约束值，绿=基准内，amber=超基准部分。
  // 新建未填设计值时采用强度=约束值，条形无信息量，跳过
  const showBar = !(isNew && !diagnosis.designChecked)
  const maxVal = Math.max(diagnosis.actualIntensity, diagnosis.benchmarkIntensity)
  const actualPct = (diagnosis.actualIntensity / maxVal) * 100
  const benchPct = (diagnosis.benchmarkIntensity / maxVal) * 100
  const overPct = Math.max(0, actualPct - benchPct)
  const barLabel = isNew ? '设计强度' : '实际用量'

  const summary = isNew
    ? [
        ['预估年用电量', `${(diagnosis.annualConsumption / 1e4).toFixed(1)} 万kWh`],
        [
          '采用强度',
          `${diagnosis.actualIntensity.toFixed(1)} kWh/㎡·a（${diagnosis.designChecked ? '设计值' : '约束值'}）`,
        ],
        ['约束值基准', `${diagnosis.benchmarkIntensity.toFixed(0)} kWh/㎡·a`],
      ]
    : [
        ['年用电量', `${(diagnosis.annualConsumption / 1e4).toFixed(1)} 万kWh`],
        ['实际单位能耗', `${diagnosis.actualIntensity.toFixed(1)} kWh/㎡·a`],
        ['对标基准', `${diagnosis.benchmarkIntensity.toFixed(0)} kWh/㎡·a`],
      ]

  return (
    <div className="mt-5 space-y-4">
      {/* 指标摘要 */}
      <div className="space-y-1.5">
        {summary.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between text-sm">
            <span className="text-paper-mute">{label}</span>
            <span className="tabular font-mono text-paper">{value}</span>
          </div>
        ))}
      </div>

      {/* 基准对比条 */}
      {showBar && (
        <div>
          <div className="relative h-6 overflow-hidden rounded bg-ink-raised">
            <div
              className="absolute inset-y-0 left-0 bg-volt"
              style={{ width: `${actualPct - overPct}%` }}
            />
            {overPct > 0 && (
              <div
                className="absolute inset-y-0 bg-amber"
                style={{ left: `${benchPct}%`, width: `${overPct}%` }}
              />
            )}
            {/* 基准虚线标记 */}
            <div
              className="absolute inset-y-0 border-l-2 border-dashed border-paper/80"
              style={{ left: `${benchPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-4 text-[11px] text-paper-mute">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-volt" />
              {barLabel}
            </span>
            {overPct > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-amber" />
                超基准
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="h-3 w-0 border-l-2 border-dashed border-paper/80" />
              {isNew ? '约束值' : '行业基准'}
            </span>
          </div>
        </div>
      )}

      {/* 结论卡：既有=节能潜力+评级；新建=设计校核 */}
      {isNew ? (
        <div className="rounded-lg border border-line bg-ink-raised px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-paper-mute">
                {diagnosis.designChecked ? '设计校核（vs 约束值）' : '预估口径（按约束值）'}
              </p>
              <p className="tabular mt-1 font-mono text-3xl font-semibold text-paper">
                {diagnosis.actualIntensity.toFixed(1)}
                <span className="ml-1 text-base">kWh/㎡·a</span>
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span
                className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${
                  diagnosis.checkResult === '达标'
                    ? RATING_TONES.优秀
                    : diagnosis.checkResult === '超标'
                      ? RATING_TONES.需改进
                      : RATING_TONES.一般
                }`}
              >
                {diagnosis.checkResult ?? '未校核'}
              </span>
              {diagnosis.checkResult === '超标' && (
                <span className="tabular font-mono text-[12px] text-amber">
                  超出约束值 {((diagnosis.overRatio - 1) * 100).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-paper-mute">
            新建建筑无实际能耗基线，节能潜力待投产后核算；建议按 GB 50189 预留分项计量。
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-line bg-ink-raised px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-paper-mute">节能潜力</p>
            <p className="tabular mt-1 font-mono text-3xl font-semibold text-paper">
              {diagnosis.savingPotential.toFixed(1)}
              <span className="ml-1 text-base">%</span>
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${RATING_TONES[diagnosis.rating]}`}
          >
            {diagnosis.rating}
          </span>
        </div>
      )}

      {/* 建议措施 Chips（既有建筑改造导向；新建的一体化建议在推荐列表的触发依据中体现） */}
      {!isNew && (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-widest text-paper-mute">
            建议措施（{typeLabel}）
          </p>
          <div className="flex flex-wrap gap-2">
            {recommendations.map((rec, i) => {
              const Icon = CHIP_ICONS[i % CHIP_ICONS.length]
              return (
                <span
                  key={rec.text}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-raised px-3 py-1.5 text-[13px] text-paper"
                >
                  <Icon size={14} className="text-volt" />
                  {rec.text}
                  {rec.starred && <Star size={12} className="fill-volt text-volt" />}
                </span>
              )
            })}
          </div>
          {era && (
            <p className="mt-2 text-[12px] leading-relaxed text-paper-mute">
              建成于 {diagnosis.year} 年 · {era.label}：{era.focus}。
              {pvHint ? ` ${pvHint}。` : ''}
            </p>
          )}
        </div>
      )}
      {/* 方案配置推荐（两种建筑性质共用，确定性派生；热力图由容器布局） */}
      <RecommendationList recs={recs} onApply={onApply} />
    </div>
  )
}
