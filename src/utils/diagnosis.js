/**
 * 模块① 能耗诊断核心 —— 纯函数（CLAUDE.md §5）。
 * 电价与建筑基准一律从 config 读取；本文件只放「评级分档」这类分类逻辑常数。
 *
 * 口径（按建筑性质分流）：
 *   既有：年用电量(kWh) = 年电费(万元) × 1e4 ÷ 电价；实际强度 = 用电量 ÷ 面积；
 *         节能潜力% = max(0, (实际 − 基准) ÷ 实际 × 100)
 *   新建：无实际电费 → 采用强度 = 设计值（若填）或约束值（预估）；
 *         预估年用电量 = 采用强度 × 面积；设计校核 = 设计值 vs 约束值；
 *         不输出节能潜力（无实际基线，红线：不编造数据）
 */
import { measures } from '../data/measures.js'

// 能效评级分档（分类逻辑，非财务系数）：实际/基准 < 0.8 优秀，< 1.2 一般，否则需改进
const RATING_GOOD = 0.8
const RATING_PASS = 1.2
// 展示阈值：潜力超过 30% 时建议措施标记为重点
const STAR_THRESHOLD = 30

/**
 * @param {{ buildingNature?: 'existing'|'new', area, buildingType, annualElectricityFee,
 *           designIntensity, province }} params
 * @param {object} config configStore 纯数值配置
 * @returns 诊断结果 | null（面积/电费等无效时）
 *   既有：{ buildingNature, annualConsumption, actualIntensity, benchmarkIntensity,
 *           savingPotential, rating }
 *   新建：{ buildingNature, annualConsumption(预估), actualIntensity(采用强度),
 *           benchmarkIntensity, savingPotential: null, rating: null,
 *           designChecked, checkResult: '达标'|'超标'|null, overRatio }
 */
export const calculateDiagnosis = (
  {
    buildingNature = 'existing',
    area: rawArea,
    buildingType,
    annualElectricityFee: rawFee,
    designIntensity: rawDesign,
    province,
  },
  config,
) => {
  const area = Number(rawArea)
  if (!Number.isFinite(area) || area <= 0) return null

  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const benchmark = config.benchmarks[buildingType]
  // 未知类型不静默兜底（错误基准比无结果更误导），表单已限定三种类型
  if (!benchmark) return null

  // ── 新建建筑：设计校核 + 预估（无实际电费，不核算节能潜力） ──
  if (buildingNature === 'new') {
    const design = Number(rawDesign)
    const designChecked = Number.isFinite(design) && design > 0
    const intensity = designChecked ? design : benchmark // 未填设计值 → 按约束值预估
    return {
      buildingNature: 'new',
      annualConsumption: intensity * area,
      actualIntensity: intensity,
      intensityBasis: designChecked ? 'design' : 'benchmark',
      benchmarkIntensity: benchmark,
      savingPotential: null,
      rating: null,
      designChecked,
      checkResult: designChecked ? (design <= benchmark ? '达标' : '超标') : null,
      overRatio: designChecked ? design / benchmark : 1,
    }
  }

  // ── 既有建筑：电费反推 + 对标（原口径不变） ──
  const fee = Number(rawFee)
  if (!Number.isFinite(fee) || fee <= 0) return null

  const annualConsumption = (fee * 10000) / prov.elecPrice // kWh
  const actualIntensity = annualConsumption / area // kWh/㎡·a
  const savingPotential = Math.max(0, ((actualIntensity - benchmark) / actualIntensity) * 100)

  const ratio = actualIntensity / benchmark
  const rating = ratio < RATING_GOOD ? '优秀' : ratio < RATING_PASS ? '一般' : '需改进'

  return {
    buildingNature: 'existing',
    annualConsumption,
    actualIntensity,
    benchmarkIntensity: benchmark,
    savingPotential,
    rating,
  }
}

/**
 * 建议措施映射：取该建筑类型前 3 条；潜力超阈值时标记为重点（starred，
 * 由 UI 用 Star 图标呈现，不用 emoji）。
 * @returns {{ text: string, starred: boolean }[]}
 */
export const getRecommendations = (buildingType, savingPotential) => {
  const starred = savingPotential > STAR_THRESHOLD
  return (measures[buildingType] ?? []).slice(0, 3).map((text) => ({ text, starred }))
}
