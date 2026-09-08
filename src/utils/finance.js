/**
 * 模块② 财务计算核心（组合测算版）—— 纯函数、无副作用、可单测（CLAUDE.md §5）。
 * 所有系数一律从入参 config 读取，本文件严禁出现任何业务数字（红线）。
 *
 * 统一口径：
 *   - 金额：万元；电量：kWh；排放因子：tCO₂/MWh（生态环境部口径）
 *   - 年净现金流 = 年毛收益 − 年运维；初始投资计 t0
 *   - IRR：NPV = 0 二分迭代，精度 0.01%（1e-4），不引入第三方财务库
 *   - 静态回收期 = 投资 / 年净现金流；净现金流 ≤ 0 时返回 'N/A'
 *   - 碳减排 = 年发电/节电量(kWh) ÷ 1000(→MWh) × 电网排放因子
 *   - 组合总账：投资/毛收益/碳减排分项相加；IRR 与回收期基于**合并现金流**——
 *     共同计算期取各系统寿命最大值，各系统现金流寿命到期后归零（不做再投资假设）
 */

// 需量计费政策门槛（全国统一规则，发改价格〔2026〕1077 号第四监管周期体系，2026-08 起）：
// 变压器 ≥315 kVA 强制两部制，100–315 kVA 可选档保守不计需量收益
const TWO_PART_KVA = 315
// 需量电价激励机制：月每 kVA 用电量 ≥260 kWh 时当月需量电价按核定标准 90% 执行
const DEMAND_INCENTIVE_KWH_PER_KVA = 260
const DEMAND_INCENTIVE_DISCOUNT = 0.9

/** NPV：t0 计 -investment，t1..T 逐年现金流取 flows[t-1] */
const npvOf = (investment, flows, rate) => {
  let total = -investment
  for (let t = 1; t <= flows.length; t += 1) {
    total += flows[t - 1] / (1 + rate) ** t
  }
  return total
}

/** 等额年金展开为逐年现金流数组（单个系统的简单场景） */
const annuityFlows = (annualNet, years) => Array.from({ length: years }, () => annualNet)

/**
 * IRR 二分迭代：现金流总收益 > 0 时 NPV 随利率单调递减，区间 [-0.9, hi] 收敛。
 * 上界自适应翻倍，覆盖回收期 < 1 年的极端参数；现金流非正或投资非正时返回 0。
 */
const calcIrr = (investment, flows) => {
  const totalFlows = flows.reduce((sum, v) => sum + v, 0)
  if (!(totalFlows > 0) || !(investment > 0)) return 0
  let lo = -0.9
  let hi = 1
  while (npvOf(investment, flows, hi) > 0 && hi < 1e4) hi *= 2
  for (let i = 0; i < 100 && hi - lo > 1e-4; i += 1) {
    const mid = (lo + hi) / 2
    if (npvOf(investment, flows, mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * 四类系统的分型测算。
 * 统一产出：capex / gross（投资与年毛收益，万元）/ energyKwh（碳减排口径电量，kWh）
 * + 对应系数组的运维比例与计算期，可选 fixedOm（固定年成本，万元，如场地租金）。
 * gross 已是「扣直接能源成本后」的毛收益。
 * demand（可选）：模块① 推定的需量上下文 { baseKw, kva, annualKwh }，仅储能消费。
 */
const perType = (projectType, scale, province, config, demand) => {
  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const price = prov.elecPrice // 元/kWh

  if (projectType === 'pv') {
    const { pv } = config
    // 投资：scale(kW) × 1000 W/kW × 元/W ÷ 1e4 元/万元 = scale × capexPerWatt / 10
    const capex = (scale * 1000 * pv.capexPerWatt) / 1e4
    // 年发电量 = 装机(kW) × 年等效利用小时(h)，再按系统效率 PR 折减 → kWh
    const genKwh = scale * prov.sunHours * pv.performanceRatio
    return {
      capex,
      gross: (genKwh * price) / 1e4,
      energyKwh: genKwh,
      omRatio: pv.omRatioPerYear,
      years: pv.lifetimeYears,
    }
  }

  if (projectType === 'storage') {
    const { storage } = config
    // 投资：scale(kWh) × 元/kWh ÷ 1e4
    const capex = (scale * storage.capexPerKWh) / 1e4
    // 年放电量按分省分时结构折算（循环判定读公开数据项 cyclesPerDay）：
    // 一充一放 = 谷充峰放 1 次全额价差循环；两充两放省另加第二循环（平充峰放），
    // 其有效价差约为全额峰谷价差一半，按等效循环 cycle2SpreadRatio 折算计入。
    // 工程修正（2026-09）：可放电量 = 容量 × DoD × 年可用天数 × 等效循环——
    // 原「容量 × 365 满充满放」口径未计放电深度与可用率，系统性高估约 20%
    const cyclesPerDay = prov.cyclesPerDay ?? 1
    const effectiveCycles = 1 + (cyclesPerDay >= 2 ? (storage.cycle2SpreadRatio ?? 0) : 0)
    const dischargeKwh =
      scale * (storage.depthOfDischarge ?? 1) * (storage.availableDaysPerYear ?? 365) * effectiveCycles
    // 充电损耗购电成本：综合效率 η 下每放 1 kWh 需充 1/η kWh，多充的 (1/η−1) 部分
    // 按充电时段购电价计价（套利真利润 = 放电量 × 价差 − 损耗电量 × 充电电价）
    const chargeLossKwh = dischargeKwh * (1 / (storage.roundTripEfficiency ?? 1) - 1)
    const arbitrage =
      (dischargeKwh * prov.peakValleySpread - chargeLossKwh * (storage.chargePricePerKwh ?? 0)) / 1e4

    // 需量管理收益（可选）：模块① 需量推定快照带入时才计——两部制按需量计费用户的
    // 削峰节省 = min(储能功率, 削峰系数 × 最大需量) × 需量电价 × 12。
    // 计费前提按政策门槛判定（≥315 kVA 强制两部制；100–315 kVA 可选档保守不计）；
    // 月每 kVA 用电 ≥260 kWh 时需量电价按 90% 执行（多省明文，确定性计入）。
    // 与套利收益同用一次放电但属不同账单科目（电量费 vs 容量费），不构成电量重复计费
    let demandSaving = 0
    let demandDetail = null
    if (demand && demand.baseKw > 0) {
      if (demand.kva < TWO_PART_KVA) {
        demandDetail = { baseKw: demand.baseKw, kva: demand.kva, skipped: '两部制门槛' }
      } else {
        const powerKw = scale / (config.storageSizing?.hours ?? 2)
        const shavedKw = Math.min(powerKw, (storage.demandShaveRatio ?? 0) * demand.baseKw)
        const monthlyPerKva = demand.annualKwh > 0 ? demand.annualKwh / 12 / demand.kva : 0
        const price =
          (storage.demandPricePerKwMonth ?? 0) *
          (monthlyPerKva >= DEMAND_INCENTIVE_KWH_PER_KVA ? DEMAND_INCENTIVE_DISCOUNT : 1)
        demandSaving = (shavedKw * price * 12) / 1e4
        demandDetail = { baseKw: demand.baseKw, kva: demand.kva, shavedKw, monthlyPerKva, price, saving: demandSaving }
      }
    }
    return {
      capex,
      gross: arbitrage + demandSaving,
      // 演示简化：碳减排按放电量计，忽略充放电时序电量结构
      energyKwh: dischargeKwh,
      omRatio: storage.omRatioPerYear,
      years: storage.lifetimeYears,
      demandDetail,
    }
  }

  if (projectType === 'cooling') {
    const { cooling } = config
    const area = scale * 1e4 // 万㎡ → ㎡
    // 投资：能源站 + 管网 + 用户接入，按供冷面积单位投资
    const capex = (area * cooling.capexPerSqm) / 1e4
    // 年供冷量（冷量）；冷费收入 = 冷量 × 冷价；购电成本 = 冷量 ÷ COP × 电价。
    // 毛收益必须扣购电成本，才反映项目真实经济性
    const demandKwh = area * cooling.kwhPerSqm
    const revenue = demandKwh * cooling.coolingPricePerKwh
    const electricityCost = (demandKwh / cooling.cop) * price
    // 碳减排：相对常规分散制冷（copBaseline）的节电量
    const savingKwh = demandKwh * (1 / cooling.copBaseline - 1 / cooling.cop)
    return {
      capex,
      gross: (revenue - electricityCost) / 1e4,
      energyKwh: savingKwh,
      omRatio: cooling.omRatioPerYear,
      years: cooling.lifetimeYears,
    }
  }

  if (projectType === 'charger') {
    const { charger } = config
    // 投资：桩数 × 单桩造价（整机 + 安装 + 配电）
    const capex = (scale * charger.capexPerPile) / 1e4
    // 年充电量 = 桩数 × 单桩日均充电量 × 365
    const annualKwh = scale * charger.dailyKwhPerPile * 365
    // 净服务费收入 = 年充电量 × 服务费单价 ×（1 − 平台抽成）；电费代收代付不过账。
    // 场地租金等固定年成本走 fixedOm，由 calculateFeasibility 统一扣除。
    // 碳减排计 0：替代燃油的交通过程减排假设链过长，本项目不核算（红线：不编造数据）
    return {
      capex,
      gross: (annualKwh * charger.serviceFee * (1 - charger.platformCutRatio)) / 1e4,
      energyKwh: 0,
      fixedOm: (scale * charger.siteCostPerPile) / 1e4,
      omRatio: charger.omRatioPerYear,
      years: charger.lifetimeYears,
    }
  }

  return null
}

/**
 * 可行性速算主入口（组合测算）
 * @param {{ systems: Object<string, {enabled: boolean, capacity: number|string}>, province: string,
 *           demand?: { baseKw: number, kva: number, annualKwh: number } | null }} params
 *   demand 为模块① 采纳推荐时随快照带入的需量推定（无诊断数据时缺省——储能不计需量收益，
 *   报告侧如实注明，不静默硬造）；仅储能消费该参数
 * @param {object} config configStore 的纯数值配置
 * @returns {{ province, demand, items: Array, total: object } | null}
 *   items：各选中系统的分项结果（储能含 demandDetail：已计入的削峰口径，或 skipped 原因）；
 *   total：组合总账（金额万元 / IRR 小数 / 回收期年（净现金流≤0 时 'N/A'）/ 碳减排 tCO₂·a⁻¹）。
 *   demand 原样回显——敏感性重建入参与分项表严格同源。无可测算项时返回 null。
 * @throws 入参形状不符时直接抛错（fail-fast，不做静默兜底）
 */
export const calculateFeasibility = ({ systems, province, demand }, config) => {
  if (!systems || typeof systems !== 'object') {
    throw new Error('calculateFeasibility: 入参缺少 systems 对象')
  }

  const entries = Object.entries(systems).filter(
    ([, sys]) => sys?.enabled && Number(sys.capacity) > 0,
  )
  if (entries.length === 0) return null

  const items = entries.map(([type, sys]) => {
    const scale = Number(sys.capacity)
    const typed = perType(type, scale, province, config, demand)
    if (!typed) throw new Error(`calculateFeasibility: 未知系统类型「${type}」`)

    const om = typed.capex * typed.omRatio // 年运维（万元，按投资比例）
    const fixedOm = typed.fixedOm ?? 0 // 固定年成本（万元，如场地租金，可选）
    const net = typed.gross - om - fixedOm // 年净现金流（万元）

    return {
      type,
      capacity: scale,
      totalInvestment: typed.capex,
      annualRevenue: typed.gross,
      annualNet: net,
      irr: calcIrr(typed.capex, annuityFlows(net, typed.years)),
      paybackPeriod: net > 0 ? typed.capex / net : 'N/A',
      carbonReduction: (typed.energyKwh / 1000) * config.general.gridEmissionFactor,
      years: typed.years,
      ...(typed.demandDetail ? { demandDetail: typed.demandDetail } : {}),
    }
  })

  const sum = (pick) => items.reduce((acc, it) => acc + pick(it), 0)
  const totalInvestment = sum((it) => it.totalInvestment)
  const annualRevenue = sum((it) => it.annualRevenue)
  const annualNet = sum((it) => it.annualNet)

  // 组合合并现金流：共同计算期 = 各系统寿命最大值，寿命到期后该系统现金流归零
  const horizon = Math.max(...items.map((it) => it.years))
  const mergedFlows = Array.from(
    { length: horizon },
    (_, t) => items.reduce((acc, it) => (t < it.years ? acc + it.annualNet : acc), 0),
  )

  return {
    province,
    demand: demand ?? null, // 回显：敏感性/报告从快照重建入参时与分项表同源
    items,
    total: {
      totalInvestment,
      annualRevenue,
      annualNet,
      irr: calcIrr(totalInvestment, mergedFlows),
      paybackPeriod: annualNet > 0 ? totalInvestment / annualNet : 'N/A',
      carbonReduction: sum((it) => it.carbonReduction),
    },
  }
}
