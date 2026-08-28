/**
 * 模块① 能耗诊断核心 —— 纯函数（CLAUDE.md §5）。
 * 电价与建筑基准一律从 config 读取；本文件只放「评级分档」这类分类逻辑常数。
 *
 * 口径（按建筑性质分流）：
 *   既有（实测口径）：年用电量(kWh) = 电费(万元，按年或按月×12) × 1e4 ÷ 电价；
 *         实际强度 = 用电量 ÷ 面积；节能潜力% = max(0, (实际 − 基准) ÷ 实际 × 100)
 *   既有（预估口径，电费未知）：年用电量按「电耗预估参考」双口径取短板——
 *         面积口径 = 典型实际强度 × 面积；变压器口径 = kVA × 功率因数 × 负载率 × 8760h；
 *         结果携带 estimate 依据行（UI 挂「预估」标签；潜力为典型值推演，非实测对标）
 *   新建：无实际电费 → 采用强度 = 设计值（若填）或约束值（预估）；
 *         预估年用电量 = 采用强度 × 面积；设计校核 = 设计值 vs 约束值；
 *         不输出节能潜力（无实际基线，红线：不编造数据）
 */
import { measures } from '../data/measures.js'
import { recommendationRules as R } from '../data/recommendationRules.js'

// 能效评级分档（分类逻辑，非财务系数）：实际/基准 < 0.8 优秀，< 1.2 一般，否则需改进
const RATING_GOOD = 0.8
const RATING_PASS = 1.2
// 展示阈值：潜力超过 30% 时建议措施标记为重点
const STAR_THRESHOLD = 30

/**
 * @param {{ buildingNature?: 'existing'|'new', area, buildingType, annualElectricityFee,
 *           feePeriod?: 'annual'|'monthly', transformerKva, designIntensity, province }} params
 * @param {object} config configStore 纯数值配置
 * @returns 诊断结果 | null（面积等无效时；电费未知走预估口径不再返回 null）
 *   既有：{ buildingNature, annualConsumption, actualIntensity, benchmarkIntensity,
 *           savingPotential, rating, estimate: { lines } | null（预估口径依据行，实测为 null） }
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
    feePeriod: rawFeePeriod = 'annual',
    transformerKva: rawTrafoKva,
    designIntensity: rawDesign,
    province,
  },
  config,
) => {
  const area = Number(rawArea)
  if (!Number.isFinite(area) || area <= 0) return null

  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const benchmark = config.benchmarks[buildingType]
  // 未知类型不静默兜底（错误基准比无结果更误导），表单类型由 benchmarkTypes 派生
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

  // ── 既有建筑：电费反推（实测口径）；电费未知按电耗预估参考兜底（预估口径） ──
  const feeRaw = Number(rawFee)
  const fee =
    Number.isFinite(feeRaw) && feeRaw > 0 ? feeRaw * (rawFeePeriod === 'monthly' ? 12 : 1) : null

  let annualConsumption
  let estimate = null // 预估口径依据行（实测口径为 null；UI 与模块③ 以此挂「预估」标注）
  if (fee) {
    annualConsumption = (fee * 10000) / prov.elecPrice // kWh
  } else {
    // 面积口径：分类型典型实际强度（存量调研中值，公开抽屉可调）× 面积
    const LE = config.loadEstimate
    const typical = LE.typicalIntensity[buildingType] ?? LE.typicalIntensity.办公
    const byArea = typical * area
    // 变压器口径：实填报装容量 × 功率因数 × 分类型平均负载率 × 8760h（未填则无此口径）
    const kva = Number(rawTrafoKva)
    const loadFactor = LE.transformerLoadFactor[buildingType] ?? 0.3
    const byTrafo =
      Number.isFinite(kva) && kva > 0
        ? kva * LE.transformerPowerFactor * loadFactor * 8760
        : null
    annualConsumption = byTrafo ? Math.min(byArea, byTrafo) : byArea
    estimate = {
      lines: [
        `面积口径：按${buildingType}典型实际强度 ${typical} kWh/㎡·a × ${area.toLocaleString()} ㎡ → 年用电约 ${Math.round(byArea / 1e4).toLocaleString()} 万 kWh`,
        ...(byTrafo
          ? [
              `变压器口径：${Math.round(kva).toLocaleString()} kVA × ${LE.transformerPowerFactor} × ${loadFactor} 负载率 × 8760h → 年用电约 ${Math.round(byTrafo / 1e4).toLocaleString()} 万 kWh`,
              byTrafo < byArea ? '双口径取短板：按变压器口径' : '双口径取短板：按面积口径',
            ]
          : []),
        ...(buildingType === '工业厂房' ? ['工艺负载主导，强度仅量级粗估，需按工艺能耗核定'] : []),
      ],
    }
  }
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
    estimate,
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

/**
 * 建成年代 → 标准代际分桶（改造侧重提示，确定性派生）。
 * 年份对能耗是「先验」而非决定量（被运行工况与改造史淹没），故只进文案不进数字；
 * 年份无效（新建/未填）返回 null，调用方不展示。
 */
export const eraOf = (year) => {
  const y = Number(year)
  if (!Number.isFinite(y) || y <= 0) return null
  return R.eraBuckets.values.find((b) => y <= b.maxYear) ?? null
}

/**
 * GB 55015-2021 光伏强条提示：2022 年起新建公共建筑光伏应装尽装，
 * 既有建筑建成 ≥2022 年时推荐屋顶光伏前应先核已装容量与屋面/并网余量。
 * 返回提示句；年份无效或早于强条年份返回 null（调用方仅对既有建筑使用）。
 */
export const pvMandatedHint = (year) => {
  const y = Number(year)
  if (!Number.isFinite(y) || y < R.eraBuckets.pvMandatedFrom) return null
  return '该年代起新建按 GB 55015-2021 多已强配光伏，建议先核已装容量与屋面、并网余量'
}
