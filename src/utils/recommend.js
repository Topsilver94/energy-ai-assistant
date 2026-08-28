/**
 * 方案配置推荐引擎（模块①）—— 确定性规则推导，非 AI 生成（同 phasing.js 定位）。
 *
 * 职责：依据诊断输入（建筑性质/类型/面积/省份）给四类系统打分排序，
 * 输出 level / 触发依据 / 建议规模 / 置信度；财务预估值调 calculateFeasibility
 * 单系统测算——数字来自自家计算器，可完整溯源（热力图财务列即此数据）。
 *
 * 纪律：
 *   - 经验查表值（屋面/供冷折算/充电桩配建）读 config 公开参考表，推断阈值读
 *     data/recommendationRules.js（均带 source）；打分权重（如基线 40/72）为引擎
 *     内部逻辑常数，决定相对排序而非财务结果
 *   - 每条推荐必须附触发依据（可解释性即可信度）
 *   - 推断不动的维度如实降级（充电桩车位未知 → confidence 'verify'）
 *   - 储能定容双口径（负荷消纳 × 变压器接入）取短板，新建按光储配比兜底；
 *     理由列明口径与推定值，不冒充实测结论
 */
import { recommendationRules as R } from '../data/recommendationRules.js'
import { calculateFeasibility } from './finance.js'
import { SPREAD_AS_OF } from '../data/coefficients.js'
import { pvMandatedHint } from './diagnosis.js'

const clamp = (v) => Math.min(100, Math.max(0, v))
const round1 = (v) => Math.round(v * 10) / 10

/**
 * 折算设计冷负荷（kW）＝ 供冷面积(万㎡) × 1e4 ㎡ × 负荷指标(W/㎡) ÷ 1000。
 * 规模口径仍为供冷面积（规划/可研口径），本函数提供设备口径（装机冷量）展示；
 * 建筑类型未知（模块② 独立使用、未做诊断）时返回 null，不编造换算。
 */
export const coolingDesignKw = (coolingScaleWanSqm, buildingType, config) => {
  const idx = config?.cooling?.loadIndex?.[buildingType ?? '']
  const kw = idx ? Math.round(Number(coolingScaleWanSqm) * idx * 10) : NaN
  return Number.isFinite(kw) && kw > 0 ? kw : null
}

/**
 * 储能布置红线（确定性提示，双出口：模块① 触发依据 + 模块③ prompt 注入）。
 * 标准号与数字为现行国标口径：GB/T 51048-2025《电化学储能电站设计标准》
 * （2026-04 实施，取代 GB 51048-2014）、GB/T 42288-2022《安全规程》、GB 55037-2022《建筑防火通用规范》。
 */
export const STORAGE_FIRE_LINE =
  '布置红线：户外电池舱（柜）间防火间距 ≥3 m 或设防火墙分隔；单个防火分区额定能量 ≤50 MWh、相邻分区 ≥10 m；探测报警与灭火按 GB/T 42288-2022 配置，防火间距与建筑布置按 GB/T 51048-2025 与 GB 55037-2022 执行'

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
 * @param {{ buildingNature?: 'existing'|'new', buildingType: string, area: number|string,
 *            province: string, roofType?: string, year?: number|string }} params
 * @param {object} config configStore 纯数值配置
 * @returns {Array<{ key, label, scaleUnit, score, level, reasons: string[], suggestedScale,
 *            confidence: 'high'|'medium'|'verify', estimate: object|null }>} 按 score 降序
 */
export const buildRecommendations = (
  {
    buildingNature = 'existing',
    buildingType,
    area: rawArea,
    province,
    roofType: rawRoof,
    year: rawYear,
    annualConsumption: rawAnnualConsumption,
    transformerKva: rawTransformerKva,
  },
  config,
) => {
  const area = Number(rawArea)
  if (!Number.isFinite(area) || area <= 0) return []
  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const isNew = buildingNature === 'new'
  // GB 55015 光伏强条：既有建成 ≥2022 年 → 光伏推荐附余量核对提示（新建按强条设计，不受此限）
  const pvHint = isNew ? null : pvMandatedHint(rawYear)

  // ── 光伏：屋面条件推导——既有按屋面类型（平/坡/彩钢，未选按类型典型值），
  //    新建不问屋面（设计未定）直接按 BIPV 一体化满铺口径；规模 kW（备案/并网通行） ──
  const typeRatio = config.roof.usableRatio[buildingType] ?? 0.4
  let roofRatio
  let roofDensity
  let roofLabel
  let roofNote = null
  if (isNew) {
    roofRatio = typeRatio * config.roof.bipv.ratioFactor
    roofDensity = config.roof.bipv.kwPerSqm
    roofLabel = 'BIPV 满铺'
  } else {
    const roofType = rawRoof || R.typicalRoof.values[buildingType] || '平屋面'
    const cfg = config.roof.types[roofType] ?? config.roof.types.平屋面
    roofRatio = typeRatio * cfg.ratioFactor
    roofDensity = cfg.kwPerSqm
    roofLabel = roofType
    roofNote =
      roofType === '坡屋面'
        ? '坡屋面顺坡满铺，需校核坡面朝向与防水节点，单位造价高于平屋面支架式'
        : roofType === '彩钢屋面'
          ? '彩钢屋面夹具直贴、安装成本最低，需复核板型厚度与屋面荷载'
          : null
  }
  const roofArea = Math.round(area * roofRatio)
  const pvKw = Math.max(R.pvMinKw.values, Math.round(roofArea * roofDensity))
  const pvScore = clamp(
    Math.round(40 + Math.min(50, (pvKw / R.pvFullScoreKw.values) * 50) + (isNew ? 5 : 0)),
  )
  const roofRatioText = Math.round(roofRatio * 100) / 100

  // ── 储能：峰谷价差直读分省公开数据（代理购电月度表，日期随 coefficients.js 的 SPREAD_AS_OF 常量）；
  //    定容双口径取短板：负荷消纳（年电量→日均×峰段可转移系数）× 变压器接入（实填或推定容量×功率占比×小时数），
  //    新建无负荷数据按光储配比兜底 ──
  const spread = prov.peakValleySpread
  const strongSpread = spread >= R.storageStrongSpread.values
  const SS = config.storageSizing
  const annualKwh = Number(rawAnnualConsumption)
  let storageKwh
  let sizingReasons
  if (isNew || !Number.isFinite(annualKwh) || annualKwh <= 0) {
    storageKwh = Math.max(R.storageMinKwh.values, Math.round(pvKw * R.storageToPvRatio.values))
    sizingReasons = [
      `新建无负荷数据，按光储配比 1:${R.storageToPvRatio.values} 兜底估算为 ${storageKwh} kWh，投产后按负荷曲线复核`,
    ]
  } else {
    // 负荷口径：日均用电量 × 峰段可转移系数（峰段放电可消纳上限，方案阶段代理系数）
    const dailyKwh = annualKwh / 365
    const eLoad = Math.round(dailyKwh * SS.peakShiftRatio)
    // 变压器口径：实填报装容量优先，留空按分类型配变指标推定（单位面积 VA/㎡ × 面积）
    const filledKva = Number(rawTransformerKva)
    const vaPerSqm = SS.transformerVa[buildingType] ?? 80
    const kva = filledKva > 0 ? Math.round(filledKva) : Math.round((area * vaPerSqm) / 1000)
    const kvaNote =
      filledKva > 0
        ? `实填 ${kva.toLocaleString()} kVA`
        : `按${buildingType} ${vaPerSqm} VA/㎡ 推定约 ${kva.toLocaleString()} kVA`
    const eTrafo = Math.round(kva * SS.transformerPowerRatio * SS.hours)
    const binding = Math.min(eLoad, eTrafo)
    // 取整到 50 kWh 工程档；下限保底 500 kWh（rules 门槛）
    storageKwh = Math.max(R.storageMinKwh.values, Math.round(binding / 50) * 50)
    sizingReasons = [
      `负荷口径：日均用电 ${Math.round(dailyKwh).toLocaleString()} kWh × 峰段可转移系数 ${SS.peakShiftRatio} → 上限约 ${eLoad.toLocaleString()} kWh`,
      `变压器口径：${kvaNote} × ${Math.round(SS.transformerPowerRatio * 100)}% × ${SS.hours}h → 上限约 ${eTrafo.toLocaleString()} kWh`,
      `按短板定容约 ${storageKwh.toLocaleString()} kWh（${SS.hours}h 系统），需负荷曲线与实际报装容量复核`,
    ]
  }
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
  // 供冷面积按占比折净（扣车库/机房/后勤等非供冷区域），投资与冷负荷均按净口径
  const coolingRatio = config.cooling.areaRatio[buildingType] ?? 1
  const coolingScale = round1((area * coolingRatio) / 1e4)
  const coolingKw = coolingDesignKw(coolingScale, buildingType, config)
  // 工业厂房冷负荷以工艺发热为主，面积指标先天粗糙 → 置信度如实降级，待工艺资料复核
  const coolingVerify = buildingType === '工业厂房'

  // ── 充电桩：类型客流代理推断，车位未知 → 置信度如实降级为待确认 ──
  const pilesPer = config.charger.pilesPer10kSqm[buildingType] ?? 4
  const piles = Math.max(R.chargerMinPiles.values, Math.round((area / 1e4) * pilesPer))
  const chargerScore = clamp(Math.round((buildingType === '商场' ? 60 : 45) + (isNew ? 5 : 0)))

  return [
    {
      key: 'pv',
      label: '分布式光伏',
      scaleUnit: 'kW',
      score: pvScore,
      level: levelOf(pvScore),
      suggestedScale: pvKw,
      confidence: 'high',
      reasons: [
        `可用屋顶约 ${roofArea} ㎡（${buildingType}·${roofLabel}，可用系数 ${roofRatioText}）`,
        `按 ${roofDensity} kW/㎡ 装机密度 → 建议约 ${pvKw} kW`,
        ...(isNew
          ? [
              `新建按 BIPV 一体化满铺测算（覆盖率 ${config.roof.bipv.ratioFactor} · 密度 ${config.roof.bipv.kwPerSqm} kW/㎡），屋面即组件、增量成本低于既有加装`,
            ]
          : roofNote
            ? [roofNote]
            : []),
        ...(pvHint ? [pvHint] : []),
      ],
      estimate: estimateOf('pv', pvKw, province, config),
    },
    {
      key: 'storage',
      label: '储能',
      scaleUnit: 'kWh',
      score: storageScore,
      level: levelOf(storageScore),
      suggestedScale: storageKwh,
      confidence: 'medium',
      reasons: [
        `当地一般工商业峰谷价差 ${spread.toFixed(2)} 元/kWh（${SPREAD_AS_OF}代理购电口径）`,
        strongSpread
          ? '价差达到两充两放经济边界，优先级高'
          : '价差一般，收益依赖充放策略精细化',
        ...(STEADY_LOAD_TYPES.includes(buildingType)
          ? [`${buildingType}全天负荷平稳，储能利用率高`]
          : []),
        ...sizingReasons,
        STORAGE_FIRE_LINE,
      ],
      estimate: estimateOf('storage', storageKwh, province, config),
    },
    {
      key: 'cooling',
      label: '集中供冷',
      scaleUnit: '万㎡',
      score: coolingScore,
      level: levelOf(coolingScore),
      suggestedScale: coolingScale,
      confidence: coolingVerify ? 'verify' : 'high',
      reasons: [
        coolingFits
          ? `${buildingType}建筑冷负荷稳定，面积 ${area.toLocaleString()} ㎡ ≥ 经济门槛 ${coolingMin.toLocaleString()} ㎡`
          : `面积 ${area.toLocaleString()} ㎡ 低于经济门槛 ${coolingMin.toLocaleString()} ㎡，管网摊销偏高`,
        ...(coolingFits && coolingKw
          ? [
              `折算设计冷负荷约 ${coolingKw} kW（负荷指标 ${config.cooling.loadIndex[buildingType]} W/㎡），供冷面积 ${coolingScale} 万㎡`,
            ]
          : []),
        ...(coolingVerify
          ? [
              `工业冷负荷以工艺发热为主，负荷指标 ${config.cooling.loadIndex[buildingType]} W/㎡ 仅作量级粗估，需工艺负荷资料复核`,
            ]
          : []),
        coolingFits
          ? `供冷面积按建筑面积 × ${coolingRatio} 折算（扣除车库/机房/后勤等非供冷区域），如仅部分区域接入请单独测算`
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
