/**
 * 方案配置推荐引擎（模块①）—— 确定性规则推导，非 AI 生成（同 phasing.js 定位）。
 *
 * 职责：依据诊断输入（建筑性质/类型/面积/省份）给四类系统打分排序，
 * 输出 level / 触发依据 / 建议规模；财务预估值调 calculateFeasibility
 * 单系统测算——数字来自自家计算器，可完整溯源（热力图财务列即此数据）。
 *
 * 纪律：
 *   - 经验查表值（屋面/供冷折算/充电桩配建）读 config 公开参考表，推断阈值读
 *     data/recommendationRules.js（均带 source）；打分权重（如基线 40/72）为引擎
 *     内部逻辑常数，决定相对排序而非财务结果
 *   - 每条推荐必须附触发依据（可解释性即可信度）
 *   - 推断不动的维度在触发依据里如实写明、不冒充实测（车位未知 → 类型代理配建推断，
 *     并提示需车位/车流资料复核）
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
 * 储能布置红线（确定性提示，仅模块③ 出口：AI prompt 注入 + 本地模板技术路径段，
 * STEP1 投资推荐不展示——投资推荐简单清晰，方案文档兜底周全，2026-09 用户确认）。
 * 标准号与数字为现行国标口径：GB/T 51048-2025《电化学储能电站设计标准》
 * （2026-04 实施，取代 GB 51048-2014）、GB/T 42288-2022《安全规程》、GB 55037-2022《建筑防火通用规范》。
 */
export const STORAGE_FIRE_LINE =
  '布置红线：户外电池舱（柜）间防火间距 ≥3 m 或设防火墙分隔；单个防火分区额定能量 ≤50 MWh、相邻分区 ≥10 m；探测报警与灭火按 GB/T 42288-2022 配置，防火间距与建筑布置按 GB/T 51048-2025 与 GB 55037-2022 执行'

// 全天候平稳负荷类型：储能充放不受日间波谷限制，利用率加分（引擎逻辑常数）
const STEADY_LOAD_TYPES = ['医院', '酒店', '数据中心']
// 区域供冷适用性弱的类型：高校以分体空调为主、工业厂房属工艺冷特例，达标也只给低档分
const COOLING_WEAK_TYPES = ['高校', '工业厂房']

/**
 * 集中供冷客户侧全生命周期成本对比（确定性派生，双出口：模块① 冷却触发依据 + 模块③ 注入）。
 * 客户视角签单钩子：自建分体空调（电费 + 维保 + 折旧，客户全担）vs 接入集中供冷（仅冷费，
 * 无初投资——能源站由投资方建设）。分体参考系数均为演示假设值（面板可调），不构成报价承诺。
 */
export const coolingTcoNote = (province, config) => {
  const c = config.cooling
  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const splitElec = (c.kwhPerSqm / c.copBaseline) * prov.elecPrice // 分体电费 = 冷量 ÷ 分散 COP × 电价
  const splitOm = c.splitAcCapexPerSqm * c.splitAcOmRatioPerYear
  const splitDep = c.splitAcCapexPerSqm / c.splitAcLifetimeYears
  const splitTotal = splitElec + splitOm + splitDep
  const district = c.kwhPerSqm * c.coolingPricePerKwh
  if (!Number.isFinite(splitTotal) || !(splitTotal > 0)) return null
  const save = splitTotal - district
  return save > 0
    ? `客户侧全生命周期对比：自建分体空调约 ${splitTotal.toFixed(1)} 元/㎡·a（电费 ${splitElec.toFixed(1)} + 维保 ${splitOm.toFixed(1)} + 折旧 ${splitDep.toFixed(1)}）vs 接入集中供冷约 ${district.toFixed(1)} 元/㎡·a —— 年省约 ${save.toFixed(1)} 元/㎡（${((save / splitTotal) * 100).toFixed(0)}%），且免整机 ${c.splitAcLifetimeYears} 年一换、免机房占用与维保责任`
    : `客户侧全生命周期对比：接入集中供冷约 ${district.toFixed(1)} 元/㎡·a vs 自建分体空调约 ${splitTotal.toFixed(1)} 元/㎡·a —— 当前冷价口径下持平或略高，需以机房空间释放、运维免责与减碳价值论证`
}

const levelOf = (score) => {
  const b = R.levelBuckets.values
  if (score >= b['推荐']) return '推荐'
  if (score >= b['可考虑']) return '可考虑'
  if (score >= b['谨慎']) return '谨慎'
  return '暂缓'
}

/** 单系统财务预估：调自家计算器（try 兜形状异常，返回 null 时热力图显示 —）；
 *  demand（可选）仅储能消费——热力图储能列与模块② 采纳后口径一致 */
const estimateOf = (key, scale, province, config, demand) => {
  try {
    const r = calculateFeasibility(
      { systems: { [key]: { enabled: true, capacity: scale } }, province, ...(demand ? { demand } : {}) },
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
 *            estimate: object|null,
 *            demand?: { baseKw, kva, annualKwh } }>} 按 score 降序（demand 仅储能项携带：需量推定快照）
 */
export const buildRecommendations = (
  {
    buildingNature = 'existing',
    buildingType,
    area: rawArea,
    province,
    roofType: rawRoof,
    roofArea: rawRoofArea,
    year: rawYear,
    annualConsumption: rawAnnualConsumption,
    transformerKva: rawTransformerKva,
    parkingSpots: rawParkingSpots,
    curve: rawCurve,
  },
  config,
) => {
  const area = Number(rawArea)
  if (!Number.isFinite(area) || area <= 0) return []
  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const isNew = buildingNature === 'new'
  // GB 55015 光伏强条：既有建成 ≥2022 年 → 光伏推荐附余量核对提示（新建按强条设计，不受此限）
  const pvHint = isNew ? null : pvMandatedHint(rawYear)

  // ── 光伏：屋面条件推导——屋面面积实填（图纸投影）优先，留空按面积 × 类型复合系数推定。
  //    塔楼/综合体等形态极端项目类型系数失真大（投影占比可能仅 3–5%），实填直接走单项折减链；
  //    既有另按屋面类型（平/坡/彩钢，未选按类型典型值）取密度与形式折减，
  //    新建不问屋面（设计未定）直接按 BIPV 一体化满铺口径；规模 kW（备案/并网通行） ──
  // 类型未知（不在基准表内）时按混合形态中位保守取值，与 usableRatio 重标口径一致
  const typeRatio = config.roof.usableRatio[buildingType] ?? 0.15
  const filledRoofArea = Number(rawRoofArea)
  const hasRoofArea = Number.isFinite(filledRoofArea) && filledRoofArea > 0
  let roofRatio
  let roofDensity
  let roofLabel
  let roofNote = null
  let roofSourceNote // 触发依据首行：实填换算链 / 推定复合系数，两口径如实分述
  let roofArea
  if (isNew) {
    const bipv = config.roof.bipv
    roofRatio = typeRatio * bipv.ratioFactor
    roofDensity = bipv.kwPerSqm
    roofLabel = 'BIPV 满铺'
    // 实填：图纸屋面 × BIPV 覆盖率（已含设备口预留，不另乘障碍检修折减，防双重扣减）
    roofArea = hasRoofArea
      ? Math.round(filledRoofArea * bipv.ratioFactor)
      : Math.round(area * roofRatio)
    roofSourceNote = hasRoofArea
      ? `实填屋面 ${Math.round(filledRoofArea).toLocaleString()} ㎡ × BIPV 覆盖率 ${bipv.ratioFactor} → 可安装约 ${roofArea.toLocaleString()} ㎡`
      : `可用屋顶约 ${roofArea.toLocaleString()} ㎡（${buildingType}·${roofLabel}，可用系数 ${Math.round(roofRatio * 100) / 100}）`
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
    // 实填：图纸屋面 × 障碍检修折减 × 屋面形式折减（坡屋面朝向另乘）
    roofArea = hasRoofArea
      ? Math.round(filledRoofArea * config.roof.installRatio * cfg.ratioFactor)
      : Math.round(area * roofRatio)
    roofSourceNote = hasRoofArea
      ? `实填屋面 ${Math.round(filledRoofArea).toLocaleString()} ㎡（${roofLabel}）× 障碍检修折减 ${config.roof.installRatio}${cfg.ratioFactor < 1 ? ` × 形式折减 ${cfg.ratioFactor}` : ''} → 可安装约 ${roofArea.toLocaleString()} ㎡`
      : `可用屋顶约 ${roofArea.toLocaleString()} ㎡（${buildingType}·${roofLabel}，可用系数 ${Math.round(roofRatio * 100) / 100}）`
  }
  const pvKw = Math.max(R.pvMinKw.values, Math.round(roofArea * roofDensity))
  const pvScore = clamp(
    Math.round(40 + Math.min(50, (pvKw / R.pvFullScoreKw.values) * 50) + (isNew ? 5 : 0)),
  )

  // ── 储能：峰谷价差直读分省公开数据（代理购电月度表，日期随 coefficients.js 的 SPREAD_AS_OF 常量），
  //    运行模式按分省分时结构判定（provinces.X.cyclesPerDay，公开数据项，与财务口径同源）；
  //    定容双口径取短板：负荷消纳（年电量→日均×峰段可转移系数）× 变压器接入（实填或推定容量×功率占比×小时数），
  //    新建无负荷数据按光储配比兜底 ──
  const spread = prov.peakValleySpread
  const strongSpread = spread >= R.storageStrongSpread.values
  const cyclesPerDay = prov.cyclesPerDay ?? 1
  const SS = config.storageSizing
  const annualKwh = Number(rawAnnualConsumption)
  // 变压器推定（实填优先，留空按分类型配变指标）：储能定容与需量基数共用
  const filledKva = Number(rawTransformerKva)
  const vaPerSqm = SS.transformerVa[buildingType] ?? 80
  const kva = filledKva > 0 ? Math.round(filledKva) : Math.round((area * vaPerSqm) / 1000)
  const kvaNote =
    filledKva > 0
      ? `实填 ${kva.toLocaleString()} kVA`
      : `按${buildingType} ${vaPerSqm} VA/㎡ 推定约 ${kva.toLocaleString()} kVA`

  // 需量基数推定（模块② 需量收益与报告注记用）：
  //   曲线实测口径（最优先）：最大需量 = 曲线最大值（15 分钟粒度即两部制需量电表口径，
  //     其余粒度在曲线质量注记中已声明偏差方向），负荷率为实测值
  //   无曲线双口径取短板：负荷率法 = 年电量 ÷ 8760 ÷ 分类型负荷率（平均负荷÷最大需量）；
  //     变压器法 = kVA × 功率因数 × 峰值负载率（= 既有平均负载率 ÷ 负荷率，复用既有系数）
  const LE = config.loadEstimate
  const LF = SS.demandLoadFactor?.[buildingType] ?? 0.45
  const annualKwhValid = Number.isFinite(annualKwh) && annualKwh > 0 ? annualKwh : 0
  const avgLF = LE.transformerLoadFactor[buildingType] ?? 0.3
  const curve =
    rawCurve && Number(rawCurve.maxKw) > 0
      ? { maxKw: Number(rawCurve.maxKw), loadFactor: Number(rawCurve.loadFactor) }
      : null
  const demandByLoad = annualKwhValid > 0 ? Math.round(annualKwhValid / 8760 / LF) : null
  const demandByTrafo = Math.round(kva * LE.transformerPowerFactor * Math.min(0.95, avgLF / LF))
  const demandBaseKw = curve
    ? Math.round(curve.maxKw)
    : Math.round(Math.min(demandByLoad ?? Infinity, demandByTrafo))
  // measured / intervalMin 随快照一起下传（模块② → finance.demandDetail → 报告文案与 AI 提示词）：
  // 口径标记跟着数字走，不依赖渲染时回读全局状态——否则「先填②后传曲线」会把推定值写成实测值。
  const demand = {
    baseKw: demandBaseKw,
    kva,
    annualKwh: annualKwhValid,
    ...(curve ? { measured: true, intervalMin: rawCurve.intervalMin } : {}),
  }

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
    const eTrafo = Math.round(kva * SS.transformerPowerRatio * SS.hours)
    const binding = Math.min(eLoad, eTrafo)
    // 取整到 50 kWh 工程档；下限保底 500 kWh（rules 门槛）
    storageKwh = Math.max(R.storageMinKwh.values, Math.round(binding / 50) * 50)
    sizingReasons = [
      `负荷口径：日均用电 ${Math.round(dailyKwh).toLocaleString()} kWh × 峰段可转移系数 ${SS.peakShiftRatio} → 上限约 ${eLoad.toLocaleString()} kWh`,
      `变压器口径：${kvaNote} × ${Math.round(SS.transformerPowerRatio * 100)}% × ${SS.hours}h → 上限约 ${eTrafo.toLocaleString()} kWh`,
      curve
        ? `按短板定容约 ${storageKwh.toLocaleString()} kWh（${SS.hours}h 系统），年电量与需量已按实测曲线口径，建议再按实际报装容量复核`
        : `按短板定容约 ${storageKwh.toLocaleString()} kWh（${SS.hours}h 系统），需负荷曲线与实际报装容量复核`,
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
  // 工业厂房冷负荷以工艺发热为主，面积指标先天粗糙 → 触发依据里如实写明待工艺资料复核
  const coolingVerify = buildingType === '工业厂房'
  // 客户侧全生命周期对比（客户视角签单钩子，确定性派生——见 coolingTcoNote 注释）
  const coolingTco = coolingFits ? coolingTcoNote(province, config) : null

  // ── 充电桩：车位实填 → 政策配建实证；留空 → 类型代理推断（触发依据里如实写明需车位资料复核）。
  //    换算链与配建表同源：充电车位 = 车位数 × 配建比例（1 车位 1 枪）→ ÷2 枪 = 双枪整机桩数。
  //    配建比例：新建读分省政策档（有源省，公开抽屉可调），未收录省与既有建筑走全国底线 10%（规则表）──
  const GUNS_PER_PILE = 2 // 桩＝120kW 双枪一体整机，与 capexPerPile/dailyKwhPerPile 口径同源
  const filledSpots = Number(rawParkingSpots)
  const hasParking = Number.isFinite(filledSpots) && filledSpots > 0
  // 类型未知时按保守端取值（双枪桩台数口径，与配建表重折口径一致）
  const pilesPer = config.charger.pilesPer10kSqm[buildingType] ?? 2
  const provPolicyRatio = isNew ? config.charger.policyRatioByProvince?.[province] : undefined
  const policyRatio = provPolicyRatio ?? R.chargerPolicyRatio.values
  const ratioLabel = provPolicyRatio
    ? `${province}新建政策档`
    : `政策底线，${isNew ? '该省未收录分省档' : '既有建筑'}，地方标准可上调`
  const guns = hasParking ? Math.ceil(filledSpots * policyRatio) : null
  const piles = Math.max(
    R.chargerMinPiles.values,
    hasParking
      ? Math.ceil(guns / GUNS_PER_PILE)
      : // 车位未知走类型配建表（按全国底线折算），分省政策档按比例线性放大（外推口径，注明）
        Math.round((area / 1e4) * pilesPer * (policyRatio / R.chargerPolicyRatio.values)),
  )
  const chargerReason = hasParking
    ? `实填车位 ${filledSpots.toLocaleString()} 个 × 配建比例 ${Math.round(policyRatio * 100)}%（${ratioLabel}）→ 充电车位约 ${guns} 个（1 车位 1 枪）→ 双枪整机建议约 ${piles} 桩 ≈ 覆盖 ${piles * GUNS_PER_PILE} 个充电车位`
    : `按${buildingType}配建水平 ${pilesPer} 桩（双枪一体）/万㎡${provPolicyRatio ? ` × ${province}政策档 ${Math.round(policyRatio * 100)}%（线性放大，基准表按全国底线折算）` : ''}，建议约 ${piles} 桩 ≈ 覆盖 ${piles * GUNS_PER_PILE} 个充电车位`
  const chargerReasons = [
    chargerReason,
    ...(hasParking
      ? ['车位为实填数据，规模按政策配建比例实证推导；建议再按车流峰值校核枪数与功率档位']
      : ['需确认车位数量与车流后定型（当前为类型代理推断）']),
    ...(isNew ? ['新建可预留配电回路与管沟，后期加装成本最低'] : []),
  ]
  const chargerScore = clamp(Math.round((buildingType === '商场' ? 60 : 45) + (isNew ? 5 : 0)))

  return [
    {
      key: 'pv',
      label: '分布式光伏',
      scaleUnit: 'kW',
      score: pvScore,
      level: levelOf(pvScore),
      suggestedScale: pvKw,
      reasons: [
        roofSourceNote,
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
      // 需量推定快照：随「填入模块②」传递，储能需量收益与报告注记用（无此快照时②独立测算不计）
      demand,
      reasons: [
        `当地一般工商业峰谷价差 ${spread.toFixed(2)} 元/kWh（${SPREAD_AS_OF}代理购电口径）`,
        cyclesPerDay >= 2
          ? `${province}分时结构支持两充两放（谷充峰放全额价差 + 平充峰放约半额价差），推荐全额峰谷套利模式`
          : `${province}分时结构按一充一放测算（谷充峰放全额价差），可叠加需量管理增厚收益`,
        strongSpread
          ? '价差进入套利优选区间，优先级高'
          : '价差一般，收益依赖充放策略精细化',
        ...(STEADY_LOAD_TYPES.includes(buildingType)
          ? [`${buildingType}全天负荷平稳，储能利用率高`]
          : []),
        curve
          ? `需量基数实测：负荷曲线最大 ${demandBaseKw.toLocaleString()} kW（${rawCurve.intervalMin} 分钟口径）· 实测负荷率 ${(curve.loadFactor * 100).toFixed(0)}%；两部制按需量计费用户（推定容量 ≥315 kVA）模块② 将计入需量削峰收益`
          : `需量基数推定：${demandByLoad ? `负荷率法约 ${demandByLoad.toLocaleString()} kW 与 ` : ''}变压器法约 ${demandByTrafo.toLocaleString()} kW 取短板 → 最大需量约 ${demandBaseKw.toLocaleString()} kW；两部制按需量计费用户（推定容量 ≥315 kVA）模块② 将计入需量削峰收益`,
        ...sizingReasons,
      ],
      estimate: estimateOf('storage', storageKwh, province, config, demand),
    },
    {
      key: 'cooling',
      label: '集中供冷',
      scaleUnit: '万㎡',
      score: coolingScore,
      level: levelOf(coolingScore),
      suggestedScale: coolingScale,
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
        ...(coolingTco ? [coolingTco] : []),
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
      reasons: chargerReasons,
      estimate: estimateOf('charger', piles, province, config),
    },
  ].sort((a, b) => b.score - a.score)
}

/**
 * 从模块① 诊断结果快照派生推荐（模块① 结果区与模块② 方案比选共用同一入口）。
 *
 * 快照字段 → 引擎入参的映射只此一份：两处组件各自 useMemo 调本函数，
 * 同入参 + 同 config ⇒ 同输出，故比选档位与 STEP1 推荐列表逐字一致，不需入 store。
 * area 非法时引擎返回空数组（未诊断 / 未填面积 → 比选显示引导语）。
 */
export const recommendFromDiagnosis = (diagnosis, config) =>
  diagnosis
    ? buildRecommendations(
        {
          buildingNature: diagnosis.buildingNature ?? 'existing',
          buildingType: diagnosis.buildingType,
          area: diagnosis.area,
          province: diagnosis.province,
          roofType: diagnosis.roofType,
          roofArea: diagnosis.roofArea,
          year: diagnosis.year,
          annualConsumption: diagnosis.annualConsumption,
          transformerKva: diagnosis.transformerKva,
          parkingSpots: diagnosis.parkingSpots,
          curve: diagnosis.curve ?? null,
        },
        config,
      )
    : []
