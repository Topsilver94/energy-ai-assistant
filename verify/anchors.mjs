// 数值锚点：闭式解 + 单位哨兵 + 手推算术 —— 常规套件成员（node verify/anchors.mjs，秒级）。
// 与其余 verify 脚本的根本差别：直接 import src/ 计算层，纯 Node ESM 运行——
// 不需要 Playwright、dev server、NODE_PATH（package.json "type": "module"，
// src/utils 与 src/data 无 React / store / DOM 依赖，2026-09-18 起数值验证首次脱离读 DOM 文本）。
//
// 为什么要有锚点：既有数值守护的期望值大多「由被测代码同一公式反解」（自洽）——
// 防回归有效，证正确无力（储能「容量×365 满充满放」高估 20% 的真实事故，自洽守护当时全绿）。
// 本文件的期望值走独立路径，按证明力分级（README「判定口径」同款，混着讲就会自欺）：
//
//   强（A1/A2）—— 闭式解：合成 config 造代数可解情形，与代码的二分迭代是两条完全不同的路径；
//          单位哨兵：系数设成可辨认整数，走查 kW→W、万㎡→㎡、元→万元 的整条换算链。
//          能证明「代码实现错」（算法 / 迭代 / 单位换算），抓不到「文档公式假设错」
//   中（A3）—— 按 CLAUDE.md §5 公式与 coefficients.js 默认值手推算术，期望值写成算式、
//          不抄代码输出。只能证明「实现相对文档漂移」，证明不了文档公式本身错
//
// 「文档公式是否贴合现实」（系数默认值对不对）锚点证明不了——那是参数级外部锚定的职责，
// 如实标注，不冒充。失败时 process.exitCode = 1。
import { defaultConfig } from '../src/data/coefficients.js'
import { defaultBenchmarks } from '../src/data/benchmarks.js'
import { recommendationRules as R } from '../src/data/recommendationRules.js'
import { calculateFeasibility } from '../src/utils/finance.js'
import { calculateDiagnosis } from '../src/utils/diagnosis.js'
import { parseLoadCurve } from '../src/utils/loadCurve.js'
import { buildRecommendations } from '../src/utils/recommend.js'

// 组装与 configStore 同形的纯数值 config（calculateDiagnosis 读 config.benchmarks[type] 无守卫，
// 缺 benchmarks 直接 TypeError）。不 import configStore——那会拖进 zustand，纯 Node 不需要
const buildConfig = () => ({ ...defaultConfig, benchmarks: { ...defaultBenchmarks } })

const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}
// 金额类比较：相对容差 1e-12（镜像表达式同序运算应逐位一致，只留浮点余量）
const near = (actual, expected, tol = 1e-12) =>
  Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected))
// 轻量路径读取（A0 钉值用；不引 utils/path.js，避免其潜在的面板耦合）
const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

// ══════════════════════════════════════════════════════════════════════════
// A0 系数指纹 —— 锚点依赖默认值，先证明「锚点认识的世界没变」
// ══════════════════════════════════════════════════════════════════════════
// 结构指纹：defaultConfig + recommendationRules 的叶子路径集合（增删系数、增删省份、
// 改规则结构都会变）。provinces 整体不进数值钉（峰谷价差按月换版会误报），但结构进：
// 换版改数值不动结构，A0 不红；动结构（如新增省份）必须来这改指纹
const leafPaths = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const p = prefix ? `${prefix}.${k}` : k
    return v !== null && typeof v === 'object' ? leafPaths(v, p) : [p]
  })
const fnv1a = (s) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
const structureNow = () =>
  [...leafPaths(defaultConfig), ...leafPaths(R).map((p) => `rules.${p}`)].sort()
const FINGERPRINT = { count: 282, hash: '467dc68c' } // 2026-09-18 口径轮基线（31 省 × 4 字段 + 四系统 + 参考表 + 规则 + pv/storage 衰减系数）
{
  const now = structureNow()
  const ok = now.length === FINGERPRINT.count && fnv1a(now.join('\n')) === FINGERPRINT.hash
  check(
    'A0 结构指纹：系数/规则叶子路径集合与基线一致',
    ok,
    ok ? undefined : `现 ${now.length} 条 / 基线 ${FINGERPRINT.count} 条——结构变了：git diff src/data 找原因，同步更新本指纹与受影响的锚点段`,
  )
}
// 数值钉：只钉 A1–A5 用到的默认值（广东四值、四系统系数、通用、基准表、规则阈值）。
// 任何一条不符 = 默认值已改，按提示同步本文件钉值与对应锚点算式
const ROOT = { ...defaultConfig, benchmarks: { ...defaultBenchmarks }, rules: R }
const PINS = [
  ['pv.capexPerWatt', 3.0], ['pv.performanceRatio', 0.9], ['pv.degradationPerYear', 0.0055],
  ['pv.omRatioPerYear', 0.01], ['pv.lifetimeYears', 25],
  ['storage.capexPerKWh', 850], ['storage.cycle2SpreadRatio', 0.5], ['storage.roundTripEfficiency', 0.88],
  ['storage.depthOfDischarge', 0.9], ['storage.availableDaysPerYear', 330], ['storage.chargePricePerKwh', 0.3],
  ['storage.degradationPerYear', 0.025],
  ['storage.demandShaveRatio', 0.1], ['storage.demandPricePerKwMonth', 30],
  ['storage.omRatioPerYear', 0.02], ['storage.lifetimeYears', 10],
  ['storageSizing.hours', 2], ['storageSizing.transformerPowerRatio', 0.25], ['storageSizing.peakShiftRatio', 0.35],
  ['cooling.capexPerSqm', 300], ['cooling.kwhPerSqm', 50], ['cooling.coolingPricePerKwh', 0.75],
  ['cooling.copBaseline', 3.0], ['cooling.cop', 5.0], ['cooling.omRatioPerYear', 0.01], ['cooling.lifetimeYears', 20],
  ['charger.capexPerPile', 50000], ['charger.dailyKwhPerPile', 180], ['charger.serviceFee', 0.45],
  ['charger.platformCutRatio', 0.15], ['charger.siteCostPerPile', 8000],
  ['charger.omRatioPerYear', 0.01], ['charger.lifetimeYears', 8],
  ['general.gridEmissionFactor', 0.5306], ['general.discountRate', 0.06],
  ['provinces.广东.sunHours', 1050], ['provinces.广东.elecPrice', 0.75],
  ['provinces.广东.peakValleySpread', 1.3529], ['provinces.广东.cyclesPerDay', 2],
  ['benchmarks.办公', 100], ['benchmarks.商场', 220], ['benchmarks.医院', 160], ['benchmarks.酒店', 120],
  ['benchmarks.高校', 70], ['benchmarks.数据中心', 6000], ['benchmarks.工业厂房', 180],
  ['rules.pvMinKw.values', 200], ['rules.pvFullScoreKw.values', 2000], ['rules.storageMinKwh.values', 500],
  ['rules.chargerMinPiles.values', 2], ['rules.chargerPolicyRatio.values', 0.1],
  ['rules.storageStrongSpread.values', 0.7], ['rules.storageToPvRatio.values', 0.5],
  ['rules.levelBuckets.values.推荐', 75], ['rules.levelBuckets.values.可考虑', 50], ['rules.levelBuckets.values.谨慎', 25],
  ['rules.coolingMinArea.values.商场', 20000], ['rules.coolingMinArea.values.数据中心', 5000],
]
{
  const drifted = PINS.filter(([path, expected]) => getPath(ROOT, path) !== expected)
    .map(([path, expected]) => `${path} 期望 ${expected} 实测 ${getPath(ROOT, path)}`)
  check(
    `A0 数值钉：锚点用到的 ${PINS.length} 个默认值未漂移`,
    drifted.length === 0,
    drifted.join('；') + (drifted.length ? '——默认值已改：同步本 PINS 与对应锚点算式；广东峰谷价差换月另需同步 verify/README m1 基线' : ''),
  )
}

// ══════════════════════════════════════════════════════════════════════════
// A1 闭式解 IRR（强）—— pv.lifetimeYears 可覆盖，造代数精确解
// ══════════════════════════════════════════════════════════════════════════
// 场景：广东 2000 kW 光伏。投资 = 2000×1000×3.0/1e4 = 600 万；
// 年净 = (2000×1050×0.9×0.75)/1e4 − 600×1% = 141.75 − 6 = 135.75 万。
// 衰减显式置 0：闭式解要求等额年金（2026-09 口径轮起默认带线性衰减，年金无闭式解；
// 衰减路径本身的正确性由 A3 手推 + numeric-audit 穿越镜像 + case-replay C4 外证覆盖）
const C = buildConfig()
const pvCapex = (2000 * 1000 * 3.0) / 1e4
const pvNet = (2000 * 1050 * 0.9 * 0.75) / 1e4 - pvCapex * 0.01
const irrWithLifetime = (years) =>
  calculateFeasibility(
    { systems: { pv: { enabled: true, capacity: 2000 } }, province: '广东' },
    { ...C, pv: { ...C.pv, lifetimeYears: years, degradationPerYear: 0 } },
  ).items[0].irr
// 容差 |Δ|≤1e-4（绝对）：二分迭代自身容差 hi−lo≤1e-4，残差天然在 e-5 量级——
// 压测实测三例误差 1.25e-5 / 2.59e-5 / 5.8e-6；写 1e-6 形 100% 误报
{
  const irr1 = irrWithLifetime(1)
  check(
    'A1 闭式解 · 单期：capex(1+r)=net ⇒ r = 135.75/600 − 1 = −77.375%',
    Math.abs(irr1 - (pvNet / pvCapex - 1)) <= 1e-4,
    `实测 ${(irr1 * 100).toFixed(4)}%`,
  )
  const x2 = (pvNet + Math.sqrt(pvNet * pvNet + 4 * pvCapex * pvNet)) / (2 * pvCapex) // x = 1+r
  const irr2 = irrWithLifetime(2)
  check(
    'A1 闭式解 · 两期：capex·x² − net·x − net = 0（x=1+r）',
    Math.abs(irr2 - (x2 - 1)) <= 1e-4,
    `实测 ${(irr2 * 100).toFixed(4)}%`,
  )
  const irr100 = irrWithLifetime(100)
  check(
    'A1 闭式解 · 永续极限：100 期年金因子 → 1/r ⇒ r → net/capex = 22.625%',
    Math.abs(irr100 - pvNet / pvCapex) <= 1e-4,
    `实测 ${(irr100 * 100).toFixed(4)}%（截断误差 e-6 量级）`,
  )
}

// ══════════════════════════════════════════════════════════════════════════
// A2 单位哨兵（强）—— 系数设成 10 的幂，让「万元」等于可辨认整数，精确 ===
// ══════════════════════════════════════════════════════════════════════════
// 覆盖 kW→W（×1000）、kWh、桩数、万㎡→㎡（×1e4）、kWh→MWh（÷1000）各换算链与
// 元→万元（÷1e4）。任何一处 ×1000 / 1e4 丢失或重复，投资/碳减排立即不等于哨兵值
const item0 = (type, capacity, override, demand) =>
  calculateFeasibility(
    {
      systems: { [type]: { enabled: true, capacity } },
      province: '广东',
      ...(demand ? { demand } : {}),
    },
    { ...C, ...override },
  ).items[0]
check(
  'A2 哨兵 · pv 10 元/W ⇒ 投资(万) === 2000 kW（走查 ×1000 ÷1e4）',
  item0('pv', 2000, { pv: { ...C.pv, capexPerWatt: 10 } }).totalInvestment === 2000,
)
check(
  'A2 哨兵 · 储能 10000 元/kWh ⇒ 投资(万) === 1000 kWh',
  item0('storage', 1000, { storage: { ...C.storage, capexPerKWh: 10000 } }).totalInvestment === 1000,
)
check(
  'A2 哨兵 · 充电桩 10000 元/桩 ⇒ 投资(万) === 50 桩',
  item0('charger', 50, { charger: { ...C.charger, capexPerPile: 10000 } }).totalInvestment === 50,
)
check(
  'A2 哨兵 · 供冷 10000 元/㎡ ⇒ 投资(万) === 1万㎡ × 1e4（走查 万㎡→㎡）',
  item0('cooling', 1, { cooling: { ...C.cooling, capexPerSqm: 10000 } }).totalInvestment === 1 * 1e4,
)
check(
  'A2 哨兵 · 排放因子 1 ⇒ 碳减排(t) === 年发电量(kWh)/1000（走查 ÷1000 ×因子）',
  item0('pv', 2000, { general: { ...C.general, gridEmissionFactor: 1 } }).carbonReduction ===
    (2000 * 1050 * 0.9) / 1000,
)

// ══════════════════════════════════════════════════════════════════════════
// A3 手推算术（中）—— 算式镜像 CLAUDE.md §5 公式与默认值，不抄代码输出
// ══════════════════════════════════════════════════════════════════════════
const one = (type, capacity, demand) =>
  calculateFeasibility(
    { systems: { [type]: { enabled: true, capacity } }, province: '广东', ...(demand ? { demand } : {}) },
    C,
  ).items[0]
{
  const r = one('pv', 2000)
  const capex = (2000 * 1000 * 3.0) / 1e4
  const gross = (2000 * 1050 * 0.9 * 0.75) / 1e4
  const net = gross - capex * 0.01
  // 回收期（累计穿越，口径轮）：年流 = 135.75 − 0.779625·t（0.55%/年线性衰减），
  // 前 4 年累计 538.32225 < 600 ≤ 第 5 年末累计 → 4 + 61.67775/132.6315 = 4.46506
  const flow = (t) => gross * (1 - 0.0055 * t) - capex * 0.01
  const cum4 = flow(0) + flow(1) + flow(2) + flow(3)
  const payback = 4 + (capex - cum4) / flow(4)
  check(
    'A3 光伏 2000 kW：投资 600 / 毛收益 141.75 / 净 135.75 / 回收（穿越）4.4651 / 碳 1002.834',
    near(r.totalInvestment, capex) && near(r.annualRevenue, gross) && near(r.annualNet, net) &&
      near(r.paybackPeriod, payback) && near(r.carbonReduction, ((2000 * 1050 * 0.9) / 1000) * 0.5306),
    `实测 ${r.totalInvestment} / ${r.annualRevenue} / ${r.annualNet} / ${r.paybackPeriod.toFixed(4)} / ${r.carbonReduction}`,
  )
  // 衰减现金流 IRR 无闭式解——与 README m1 基线 1 位小数互证（独立手算路径：衰减年金二分）
  check(
    'A3 光伏 · README m1 互证：IRR 21.9%（衰减口径）',
    (r.irr * 100).toFixed(1) === '21.9',
    `实测 ${(r.irr * 100).toFixed(2)}%`,
  )
}
{
  // 储能两充两放（广东 cyclesPerDay=2）：等效循环 1+0.5，放电量 1000×0.9×330×1.5
  const r = one('storage', 1000)
  const capex = (1000 * 850) / 1e4
  const discharge = 1000 * 0.9 * 330 * (1 + 0.5)
  const loss = discharge * (1 / 0.88 - 1)
  const gross = (discharge * 1.3529 - loss * 0.3) / 1e4
  const net = gross - capex * 0.02
  check(
    'A3 储能 1000 kWh：投资 85 / 毛 58.4492 / 净 56.7492 / 碳 236.3823（含损耗购电扣减）',
    near(r.totalInvestment, capex) && near(r.annualRevenue, gross) && near(r.annualNet, net) &&
      near(r.carbonReduction, (discharge / 1000) * 0.5306),
    `实测 ${r.totalInvestment} / ${r.annualRevenue} / ${r.annualNet} / ${r.carbonReduction}`,
  )
  // verify/README m1 已有人工核对基线（IRR 63.7% / 回收 1.5 年，2026-09 口径轮衰减后）——
  // 保留 1 位小数互证，这是锚点文件里唯一「文档基线」来源的一行，系数换版时与 m1 同步
  check(
    'A3 储能 · README m1 互证：IRR 63.7% / 回收 1.5 年',
    (r.irr * 100).toFixed(1) === '63.7' && r.paybackPeriod.toFixed(1) === '1.5',
    `实测 ${(r.irr * 100).toFixed(2)}% / ${r.paybackPeriod.toFixed(3)}`,
  )
}
{
  const r = one('cooling', 1)
  const capex = (1 * 1e4 * 300) / 1e4
  const demandKwh = 1 * 1e4 * 50
  const gross = (demandKwh * 0.75 - (demandKwh / 5) * 0.75) / 1e4
  const net = gross - capex * 0.01
  const carbon = ((demandKwh * (1 / 3 - 1 / 5)) / 1000) * 0.5306
  check(
    'A3 供冷 1 万㎡：投资 300 / 毛 30（冷费 37.5 − 购电 7.5）/ 净 27 / 碳 35.373',
    near(r.totalInvestment, capex) && near(r.annualRevenue, gross) && near(r.annualNet, net) &&
      near(r.carbonReduction, carbon),
    `实测 ${r.totalInvestment} / ${r.annualRevenue} / ${r.annualNet} / ${r.carbonReduction}`,
  )
}
{
  const r = one('charger', 50)
  const capex = (50 * 50000) / 1e4
  const kwh = 50 * 180 * 365
  const gross = (kwh * 0.45 * (1 - 0.15)) / 1e4
  const fixed = (50 * 8000) / 1e4
  const net = gross - capex * 0.01 - fixed
  check(
    'A3 充电桩 50 桩：投资 250 / 毛 125.65125 / 固定成本 40 / 净 83.15125 / 碳 0',
    near(r.totalInvestment, capex) && near(r.annualRevenue, gross) && near(r.annualNet, net) &&
      r.carbonReduction === 0,
    `实测 ${r.totalInvestment} / ${r.annualRevenue} / ${r.annualNet} / ${r.carbonReduction}`,
  )
}
{
  // 两系统合计（m1 主路径）：合计投资 = 分项和 === 685（精确）；
  // 碳减排 = 光伏 + 储能分项（同序求和）；IRR/回收期读 README m1 互证
  const combo = calculateFeasibility(
    {
      systems: { pv: { enabled: true, capacity: 2000 }, storage: { enabled: true, capacity: 1000 } },
      province: '广东',
    },
    C,
  )
  const pvCarbon = ((2000 * 1050 * 0.9) / 1000) * 0.5306
  const stDischarge = 1000 * 0.9 * 330 * (1 + 0.5)
  const stCarbon = (stDischarge / 1000) * 0.5306
  check(
    'A3 合计（光伏 2000 + 储能 1000）· README m1 互证：投资 === 685 / IRR 26.3% / 回收 3.6 年',
    combo.total.totalInvestment === 685 &&
      (combo.total.irr * 100).toFixed(1) === '26.3' &&
      combo.total.paybackPeriod.toFixed(1) === '3.6' &&
      near(combo.total.carbonReduction, pvCarbon + stCarbon),
    `实测 ${combo.total.totalInvestment} / ${(combo.total.irr * 100).toFixed(2)}% / ${combo.total.paybackPeriod.toFixed(3)} / ${combo.total.carbonReduction.toFixed(4)}`,
  )
}

// ══════════════════════════════════════════════════════════════════════════
// A4 需量锚点 —— 两部制门槛（315 kVA）与激励价（月每 kVA ≥260 kWh ⇒ 90%）分段
// ══════════════════════════════════════════════════════════════════════════
const demandOf = (capacity, demand) =>
  calculateFeasibility(
    { systems: { storage: { enabled: true, capacity } }, province: '广东', demand },
    C,
  ).items[0].demandDetail
check(
  'A4 · kva 314 → skipped 两部制门槛（100–315 可选档保守不计）',
  demandOf(400, { baseKw: 1000, kva: 314, annualKwh: 982800 })?.skipped === '两部制门槛',
)
{
  const d = demandOf(400, { baseKw: 1000, kva: 315, annualKwh: 3120 * 315 })
  check(
    'A4 · kva 315 + 月每 kVA = 3120×315/12/315 = 260（精确）→ 需量电价 30×0.9 === 27（无浮点漂移）',
    d.monthlyPerKva === 260 && d.price === 27,
    `实测 monthlyPerKva ${d.monthlyPerKva} / price ${d.price}`,
  )
}
check(
  'A4 · 月每 kVA = 260−ε（annualKwh −1）→ 全价 30',
  demandOf(400, { baseKw: 1000, kva: 315, annualKwh: 3120 * 315 - 1 }).price === 30,
)
{
  // 削峰封顶 min(功率, 削峰系数×需量)：功率 = 容量÷2h，200 kWh 恰好压在 0.1×1000=100 kW 上
  const capAt = (capacity) => demandOf(capacity, { baseKw: 1000, kva: 315, annualKwh: 982800 }).shavedKw
  check(
    'A4 · 削峰封顶：100/199/200/201/400 kWh → 50/99.5/100/100/100',
    capAt(100) === 50 && capAt(199) === 99.5 && capAt(200) === 100 && capAt(201) === 100 && capAt(400) === 100,
    `实测 ${[100, 199, 200, 201, 400].map((k) => capAt(k)).join('/')}`,
  )
}
{
  // 需量收益算式：(100 kW × 27 元 × 12)/1e4 = 3.24 万，计入储能年毛收益
  const r = one('storage', 200, { baseKw: 1000, kva: 315, annualKwh: 982800 })
  const discharge = 200 * 0.9 * 330 * (1 + 0.5)
  const loss = discharge * (1 / 0.88 - 1)
  const arb = (discharge * 1.3529 - loss * 0.3) / 1e4
  check(
    'A4 · 需量收益 3.24 万计入年毛收益（套利 + 需量两科目）',
    near(r.annualRevenue, arb + (100 * 27 * 12) / 1e4),
    `实测 ${r.annualRevenue}`,
  )
}

// ══════════════════════════════════════════════════════════════════════════
// A5 解析与档位边界 —— 期望值由生成式闭式反解；档位「正好压线」精确断言
// ══════════════════════════════════════════════════════════════════════════
// 陷阱（压测实测）：不能用 Buffer.from(csv).buffer 喂 parseLoadCurve——Buffer 走 8KB
// 池，TextDecoder 会读到池内陈旧字节；用 TextEncoder
const enc = (csv) => new TextEncoder().encode(csv)
{
  const stats = parseLoadCurve(
    enc(Array.from({ length: 35040 }, () => '500').join('\n')),
    'const.csv',
  ).stats
  check(
    'A5 曲线 · 恒定 500 kW × 35,040 点：年电量 438 万 / 最大 500 / 负荷率 1.0 / 粒度按行数推断 15 分钟',
    stats.annualKwh === 500 * 8760 && stats.maxKw === 500 && stats.loadFactor === 1 &&
      stats.intervalMin === 15 && stats.rows === 35040 && stats.days === 365 &&
      stats.notes.some((n) => n.includes('按行数推断')),
    `实测 ${stats.annualKwh} / ${stats.maxKw} / ${stats.loadFactor} / ${stats.intervalMin} 分钟 / ${stats.rows} 点`,
  )
}
{
  // 锯齿 500↔785 交替：闭式 均值 = (500+785)/2 = 642.5，负荷率 = 642.5/785
  const pts = []
  for (let i = 0; i < 35040; i += 1) pts.push(i % 2 === 0 ? '500' : '785')
  const stats = parseLoadCurve(enc(pts.join('\n')), 'saw.csv').stats
  check(
    'A5 曲线 · 锯齿 500↔785：年电量 562.83 万 / 最大 785 / 均值 642.5 / 负荷率 0.818',
    stats.annualKwh === Math.round(((500 + 785) / 2) * 8760) && stats.maxKw === 785 &&
      stats.avgKw === 642.5 && stats.loadFactor === Math.round(((500 + 785) / 2 / 785) * 1000) / 1000,
    `实测 ${stats.annualKwh} / ${stats.maxKw} / ${stats.avgKw} / ${stats.loadFactor}`,
  )
}
{
  // 96 点均值 100/96：年电量按未舍入均值算 → 9125；而展示值 avgKw 舍入到 1 位小数 = 1.0，
  // 1.0×8760 = 8760 ≠ 9125。钉住「期望必须由生成式反解，不得用舍入后的展示值」
  const stats = parseLoadCurve(
    enc(Array.from({ length: 96 }, () => String(100 / 96)).join('\n')),
    'frac.csv',
  ).stats
  check(
    'A5 曲线 · 96 点 × 100/96：annualKwh === 9125 而 avgKw === 1.0（计算口径 ≠ 展示舍入）',
    stats.annualKwh === 9125 && stats.avgKw === 1.0,
    `实测 ${stats.annualKwh} / ${stats.avgKw}`,
  )
}
{
  // 评级阈值正好压线：fee 60 万 → 年电量 60×1e4/0.75 = 80 万 kWh → 强度 80 → ratio === 0.8 →
  // 「一般」（评级用严格 <，0.8 不算优秀）——已实测确定可达，故精确断言，另加 ±ε 探针
  const dg = (fee) =>
    calculateDiagnosis(
      { buildingNature: 'existing', area: 10000, buildingType: '办公', annualElectricityFee: fee, province: '广东' },
      C,
    )
  const at60 = dg(60)
  check(
    "A5 评级压线 · fee 60 → 强度 80 → ratio 0.8 → '一般'（潜力 0）",
    at60.actualIntensity === 80 && at60.rating === '一般' && at60.savingPotential === 0,
    `实测 ${at60.actualIntensity} / ${at60.rating} / ${at60.savingPotential}`,
  )
  check("A5 评级探针 · fee 59.99 → '优秀'，fee 60.01 → '一般'", dg(59.99).rating === '优秀' && dg(60.01).rating === '一般')
  check(
    "A5 评级压线 · fee 90 → 强度 120 → ratio 1.2 → '需改进'；fee 89.9 → '一般'",
    dg(90).rating === '需改进' && dg(90).actualIntensity === 120 && dg(89.9).rating === '一般',
  )
}
{
  // 档位边界：供冷 数据中心 5000㎡ / 商场 20000㎡ 正好压线 → 75「推荐」；
  // 新建非商场充电桩 45+5 = 50 正好压线「可考虑」。
  // 三档制（口径轮 C）：打分为引擎逻辑常数（最低 28 = 供冷低于门槛档），「暂缓」（<25）
  // 对任何 config 结构性不可达，档位已删（numeric-audit 疑点⑥守护同款）
  const rec = (params) => buildRecommendations({ province: '广东', ...params }, C)
  const byKey = (cards, key) => cards.find((c) => c.key === key)
  const dc = byKey(rec({ buildingType: '数据中心', area: 5000 }), 'cooling')
  check(
    "A5 档位压线 · 供冷：数据中心 5000㎡ → 75 '推荐'",
    dc.score === 75 && dc.level === '推荐',
    `实测 ${dc.score} / ${dc.level}`,
  )
  check(
    "A5 档位 · 供冷：数据中心 4999㎡ → 28 '谨慎'（默认系数地板）",
    byKey(rec({ buildingType: '数据中心', area: 4999 }), 'cooling').score === 28,
  )
  check(
    "A5 档位压线 · 供冷：商场 20000㎡ → 75 '推荐'",
    byKey(rec({ buildingType: '商场', area: 20000 }), 'cooling').score === 75,
  )
  check(
    "A5 档位压线 · 充电桩：新建办公 → 45+5 = 50 '可考虑'",
    byKey(rec({ buildingNature: 'new', buildingType: '办公', area: 10000 }), 'charger').score === 50,
  )
}

console.log(failures.length === 0 ? '\n锚点全部通过' : `\n锚点 ${failures.length} 项红：${failures.join('；')}`)
process.exitCode = failures.length > 0 ? 1 : 0
