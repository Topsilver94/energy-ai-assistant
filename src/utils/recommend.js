/**
 * 方案配置推荐引擎（模块①）—— 确定性规则推导，非 AI 生成（同 phasing.js 定位）。
 *
 * 职责：依据诊断输入（建筑性质/类型/面积/省份）给四类系统打分排序，
 * 输出 level / 触发依据 / 建议规模 / 置信度；财务预估值调 calculateFeasibility
 * 单系统测算——数字来自自家计算器，可完整溯源（热力图财务列即此数据）。
 *
 * 纪律：
 *   - 规模与阈值类参数全部来自 data/recommendationRules.js（带 source）；
 *     打分权重（如基线 40/72）为引擎内部逻辑常数，决定相对排序而非财务结果
 *   - 每条推荐必须附触发依据（可解释性即可信度）
 *   - 推断不动的维度如实降级（充电桩车位未知 → confidence 'verify'）
 *   - 储能规模按光储配比估算，理由中注明需负荷数据修正，不冒充实测结论
 */
import { recommendationRules as R } from '../data/recommendationRules.js'
import { calculateFeasibility } from './finance.js'

const clamp = (v) => Math.min(100, Math.max(0, v))
const round1 = (v) => Math.round(v * 10) / 10

// 全天候平稳负荷类型：储能充放不受日间波谷限制，利用率加分（引擎逻辑常数）
const STEADY_LOAD_TYPES = ['医院', '酒店', '数据中心']
// 区域供冷适用性弱的类型：高校以分体空调为主、工业厂房属工艺冷特例，达标也只给低档分
const COOLING_WEAK_TYPES = ['高校', '工业厂房']

const levelOf = (score) => {
  const b = R.levelBuckets.values
  if (score >= b['推荐']) return '推荐'
  if (score >= b['可考虑']) return '可考虑'
  if (score >= b['谨慎']) return '谨慎'
  return '暂缓'
}

/** 单系统财务预估：调自家计算器（try 兜形状异常，返回 null 时热力图显示 —） */
const estimateOf = (key, scale, province, config) => {
  try {
    const r = calculateFeasibility(
      { systems: { [key]: { enabled: true, capacity: scale } }, province },
      config,
    )
    const it = r?.items?.[0]
    if (!it) return null
    return {
      totalInvestment: it.totalInvestment,
      irr: it.irr,
      paybackPeriod: it.paybackPeriod,
      carbonReduction: it.carbonReduction,
    }
  } catch {
    return null
  }
}

/**
 * @param {{ buildingNature?: 'existing'|'new', buildingType: string, area: number|string, province: string }} params
 * @param {object} config configStore 纯数值配置
 * @returns {Array<{ key, label, scaleUnit, score, level, reasons: string[], suggestedScale,
 *            confidence: 'high'|'medium'|'verify', estimate: object|null }>} 按 score 降序
 */
export const buildRecommendations = (
  { buildingNature = 'existing', buildingType, area: rawArea, province },
  config,
) => {
  const area = Number(rawArea)
  if (!Number.isFinite(area) || area <= 0) return []
  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const isNew = buildingNature === 'new'

  // ── 光伏：屋顶可用面积推导（高层系数低、低层大屋面系数高） ──
  const roofRatio = R.roofUsableRatio.values[buildingType] ?? 0.4
  const roofArea = Math.round(area * roofRatio)
  const pvMw = Math.max(R.pvMinMw.values, round1((roofArea * R.pvKwPerSqm.values) / 1000))
  const pvScore = clamp(
    Math.round(40 + Math.min(50, (pvMw / R.pvFullScoreMw.values) * 50) + (isNew ? 5 : 0)),
  )

  // ── 储能：峰谷价差 = 电价 × 套利系数（复用模块②已有系数，零新增数据） ──
  const spread = prov.elecPrice * config.storage.arbitrageRatio
  const strongSpread = spread >= R.storageStrongSpread.values
  const storageMwh = Math.max(R.storageMinMwh.values, round1(pvMw * R.storageToPvRatio.values))
  const storageScore = clamp(
    Math.round((strongSpread ? 72 : 48) + (STEADY_LOAD_TYPES.includes(buildingType) ? 8 : 0)),
  )

  // ── 集中供冷：类型冷负荷特征 + 面积经济门槛；新建规划期介入成本最低 ──
  const coolingMin = R.coolingMinArea.values[buildingType] ?? 50000
  const coolingFits = area >= coolingMin
  const coolingBase = coolingFits
    ? (COOLING_WEAK_TYPES.includes(buildingType) ? 55 : buildingType === '办公' ? 62 : 75)
    : 28
  const coolingScore = clamp(Math.round(coolingBase + (isNew && coolingFits ? 15 : 0)))
  const coolingScale = round1(area / 1e4)

  // ── 充电桩：类型客流代理推断，车位未知 → 置信度如实降级为待确认 ──
  const pilesPer = R.chargerPilesPer10kSqm.values[buildingType] ?? 4
  const piles = Math.max(R.chargerMinPiles.values, Math.round((area / 1e4) * pilesPer))
  const chargerScore = clamp(Math.round((buildingType === '商场' ? 60 : 45) + (isNew ? 5 : 0)))

  return [
    {
      key: 'pv',
      label: '分布式光伏',
      scaleUnit: 'MW',
      score: pvScore,
      level: levelOf(pvScore),
      suggestedScale: pvMw,
      confidence: 'high',
      reasons: [
        `可用屋顶约 ${roofArea} ㎡（${buildingType}建筑可用系数 ${roofRatio}）`,
        `按 ${R.pvKwPerSqm.values} kW/㎡ 装机密度 → 建议约 ${pvMw} MW`,
        ...(isNew ? ['新建可按 BIPV 一体化设计，屋面与结构成本摊薄'] : []),
      ],
      estimate: estimateOf('pv', pvMw, province, config),
    },
    {
      key: 'storage',
      label: '储能',
      scaleUnit: 'MWh',
      score: storageScore,
      level: levelOf(storageScore),
      suggestedScale: storageMwh,
      confidence: 'medium',
      reasons: [
        `预计峰谷价差约 ${spread.toFixed(2)} 元/kWh（电价 ${prov.elecPrice} × 套利系数 ${config.storage.arbitrageRatio}）`,
        strongSpread
          ? '价差达到两充两放经济边界，优先级高'
          : '价差一般，收益依赖充放策略精细化',
        ...(STEADY_LOAD_TYPES.includes(buildingType)
          ? [`${buildingType}全天负荷平稳，储能利用率高`]
          : []),
        `规模按光储配比 1:${R.storageToPvRatio.values} 估算为 ${storageMwh} MWh，需负荷数据修正`,
      ],
      estimate: estimateOf('storage', storageMwh, province, config),
    },
    {
      key: 'cooling',
      label: '集中供冷',
      scaleUnit: '万㎡',
      score: coolingScore,
      level: levelOf(coolingScore),
      suggestedScale: coolingScale,
      confidence: 'high',
      reasons: [
        coolingFits
          ? `${buildingType}建筑冷负荷稳定，面积 ${area.toLocaleString()} ㎡ ≥ 经济门槛 ${coolingMin.toLocaleString()} ㎡`
          : `面积 ${area.toLocaleString()} ㎡ 低于经济门槛 ${coolingMin.toLocaleString()} ㎡，管网摊销偏高`,
        coolingFits
          ? `供冷面积按建筑面积估算，如仅部分区域接入请单独测算`
          : `可先评估单体高效机房，区域供冷留待扩建后重估`,
        ...(isNew && coolingFits ? ['规划期介入可共享管沟与机房土建，单位投资最低'] : []),
      ],
      estimate: estimateOf('cooling', coolingScale, province, config),
    },
    {
      key: 'charger',
      label: '充电桩',
      scaleUnit: '桩',
      score: chargerScore,
      level: levelOf(chargerScore),
      suggestedScale: piles,
      confidence: 'verify',
      reasons: [
        `按${buildingType}配建水平 ${pilesPer} 桩/万㎡，建议约 ${piles} 桩`,
        '需确认车位数量与车流后定型（当前为类型代理推断）',
        ...(isNew ? ['新建可预留配电回路与管沟，后期加装成本最低'] : []),
      ],
      estimate: estimateOf('charger', piles, province, config),
    },
  ].sort((a, b) => b.score - a.score)
}
