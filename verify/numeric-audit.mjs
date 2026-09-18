// 一次性数值审计（诊断件，不进常规套件主链路——同 heatmap-layout.cjs 的定位）。
// 网格扫描结构不变量 + 把 6 条已知疑点钉成「现状断言」：纯 Node ESM 直接 import src/ 计算层，
// 不需要 Playwright / dev server（node verify/numeric-audit.mjs，几秒）。
//
// 与 anchors.mjs 的分工：锚点证「算得对」（独立期望）；本文件扫「结构异常」（口径不一致、
// 边界行为、单位串位、NaN 泄漏）并刻画现状。疑点钉住的含义：行为被改动的瞬间本脚本
// 能看出来（改前改后各跑一次，差异可归因），钉住 ≠ 认可。
//
// 纪律（压测实测的坑，违反就误报，写码时盯住）：
//   - 禁止对 paybackPeriod 直接用 >/<（'N/A' > 0 静默为 false，单调性检查会虚假通过；
//     先 typeof === 'number' 再比较）
//   - 禁止用 === null 判 points[].irr（失败点是 undefined，用 != null）
//   - IRR 残差用符号夹逼不用绝对值：二分容差 hi−lo ≤ 1e-4 ⇒ 返回值 NPV 残差最坏 2.7e-4，
//     1e-6 形状 100% 误报（压测推翻过初版）
//   - 禁止浅拷贝后改嵌套系数：{...defaultConfig} 的 storage/provinces 等仍是共享引用，
//     delete/赋值会写穿模块级 defaultConfig，污染后续所有段落（初版疑点① 因此打出
//     21.2%/4.512 的脏数——⑧b 的 delete 先把广东 cyclesPerDay 删了）。改系数一律
//     structuredClone 深拷贝，文末快照自检兜底
import { defaultConfig } from '../src/data/coefficients.js'
import { defaultBenchmarks } from '../src/data/benchmarks.js'
import { calculateFeasibility } from '../src/utils/finance.js'
import { buildSensitivity } from '../src/utils/sensitivity.js'
import { buildRecommendations } from '../src/utils/recommend.js'

// 深拷贝：本脚本会 delete 可选系数、调高造价做复现，必须与模块级默认值完全隔离
const cfg0 = () => structuredClone({ ...defaultConfig, benchmarks: defaultBenchmarks })
const DEFAULTS_SNAPSHOT = JSON.stringify({ defaultConfig, defaultBenchmarks })

// 本地 NPV（镜像 finance.js 口径约定：t0 计 −投资）——仅用于残差夹逼与观察项，不是独立期望
const npv = (investment, flows, rate) => {
  let t = -investment
  for (let i = 1; i <= flows.length; i += 1) t += flows[i - 1] / (1 + rate) ** i
  return t
}
// 回收期镜像（口径轮后疑点① 守护用）：与 finance.js paybackOf 同式同序逐位一致——
// 镜像护栏防 paybackOf 将来被改成别的路径，不是正确性证据（正确性由 anchors A3 手推覆盖）
const crossingOf = (investment, flows) => {
  let cum = 0
  for (let t = 0; t < flows.length; t += 1) {
    const prev = cum
    cum += flows[t]
    if (cum >= investment && flows[t] > 0) return t + (investment - prev) / flows[t]
  }
  return 'N/A'
}

const CHECK_IDS = [
  '① config 不可变', '② 守恒律（重言式护栏）', '③ IRR 符号夹逼', '④ 单系统 total===item',
  '⑤ 线性齐次（2 的幂 ⇒ 逐位）', '⑥ 需量分段封顶', '⑦ 敏感性接线（平坦轴/方向/基准档）',
  '⑧ NaN 泄漏扫描', '⑨ recommend→finance 联动', '⑩ horizon 截断生效', '⑪ 入参边界',
  '疑点① 回收期=合并流累计穿越（口径轮已修·守护）', '疑点② IRR>0 ⟺ 回收期有解（口径轮已修·同态律）',
  '疑点③ 负 IRR ⇒ 回收 N/A（口径轮已修·守护）', '疑点④ 未收录省静默回退（钉现状）',
  '疑点⑤ 既有建筑误挂新建文案（钉现状）', '疑点⑥ 暂缓档不可达（钉现状）',
  '自检 模块默认值未被本脚本污染',
]
const bad = {}
const fail = (id, msg) => {
  if (!bad[id]) bad[id] = []
  bad[id].push(msg)
}
// 数值有限性全走查：任何 number 字段非有限即抛（NaN 泄漏最终都长这样，不报错）
const finiteWalk = (v, path) => {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${path} = ${v}`)
  if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) finiteWalk(x, `${path}.${k}`)
  }
}

// ── 网格：6 省 × 4 系统规模档 × 3 种需量（含 314 门槛档）+ 5 种组合 × 6 省 × 3 需量 ──
const PROVINCES = ['广东', '天津', '北京', '山西', '甘肃', '上海'] // 两充两放·大价差 / 两充两放 / 回退首键 / 中价差 / 全国最低价差 / 两部制样本
const SCALES = { pv: [200, 800, 2000, 5000], storage: [500, 1000, 2000], cooling: [0.5, 1, 2], charger: [2, 10, 50] }
const DEMANDS = [
  null,
  { baseKw: 1000, kva: 314, annualKwh: 982800 }, // 门槛之下 → skipped
  { baseKw: 1000, kva: 315, annualKwh: 982800 }, // 强制两部制 + 激励价档（月每 kVA = 260）
]
const SCALE1 = { pv: 2000, storage: 1000, cooling: 1, charger: 50 }
const COMBOS = [['pv', 'storage'], ['pv', 'charger'], ['cooling', 'charger'], ['pv', 'storage', 'cooling'], ['pv', 'storage', 'cooling', 'charger']]
const runs = []
for (const province of PROVINCES) {
  for (const [type, scales] of Object.entries(SCALES)) {
    for (const capacity of scales) {
      for (const d of DEMANDS) {
        runs.push({ id: `${province}/${type}${capacity}${d ? `/需量${d.kva}` : ''}`, province, systems: { [type]: { enabled: true, capacity } }, demand: d })
      }
    }
  }
  for (const combo of COMBOS) {
    for (const d of DEMANDS) {
      runs.push({
        id: `${province}/[${combo.join('+')}]${d ? `/需量${d.kva}` : ''}`,
        province,
        systems: Object.fromEntries(combo.map((t) => [t, { enabled: true, capacity: SCALE1[t] }])),
        demand: d,
      })
    }
  }
}

let ranSensitivity = 0
for (const run of runs) {
  const config = cfg0()
  const before = JSON.stringify(config)
  const r = calculateFeasibility(
    { systems: run.systems, province: run.province, ...(run.demand ? { demand: run.demand } : {}) },
    config,
  )
  const sens = buildSensitivity(
    { systems: run.systems, province: run.province, ...(run.demand ? { demand: run.demand } : {}) },
    config,
  )
  if (JSON.stringify(config) !== before) fail('① config 不可变', `${run.id} 扰动了入参 config`)
  ranSensitivity += 1

  // ② 守恒律。注释必须写明：这三条与 finance.js 用同一 reduce、同一数组——重言式，永不失败，
  // 留作重构护栏（防止将来合计口径改走别的路径），不是正确性证据
  const sum = (pick) => r.items.reduce((a, it) => a + pick(it), 0)
  if (r.total.totalInvestment !== sum((it) => it.totalInvestment)) fail('② 守恒律（重言式护栏）', `${run.id} 投资合计不等于分项和`)
  if (r.total.annualRevenue !== sum((it) => it.annualRevenue)) fail('② 守恒律（重言式护栏）', `${run.id} 毛收益合计不等于分项和`)
  if (r.total.carbonReduction !== sum((it) => it.carbonReduction)) fail('② 守恒律（重言式护栏）', `${run.id} 碳减排合计不等于分项和`)
  // 疑点① 口径轮后守护：回收期 = 合并逐年现金流累计首次穿越投资额（与 IRR 同流同口径），
  // 与本地镜像逐位一致；顺带单侧不等式——各年流 ≤ 首年净（衰减非负）⇒ 穿越 ≥ 投资/首年净
  if (r.total.paybackPeriod !== crossingOf(r.total.totalInvestment, r.total.mergedFlows)) {
    fail('疑点① 回收期=合并流累计穿越（口径轮已修·守护）', `${run.id} 回收期 ≠ 合并流累计穿越镜像`)
  }
  if (
    typeof r.total.paybackPeriod === 'number' &&
    !(r.total.paybackPeriod >= r.total.totalInvestment / r.total.annualNet)
  ) {
    fail('疑点① 回收期=合并流累计穿越（口径轮已修·守护）', `${run.id} 回收期 < 投资/首年净（穿越比等分还快，不可能）`)
  }
  // 疑点② 同态律（口径轮后）：IRR>0 ⇔ 未折现总流量 > 投资 ⇔ 累计必穿越 ⇒ 回收期有解。
  // 原「IRR 为正却 N/A」矛盾在两指标同用合并逐年现金流后结构性消失（IRR 恰为 0 的测度零
  // 边界不在网格内；totalFlows ≤ 0 时 calcIrr 返回 0 且必 N/A，同态仍成立）
  if ((typeof r.total.paybackPeriod === 'number') !== (r.total.irr > 0)) {
    fail('疑点② IRR>0 ⟺ 回收期有解（口径轮已修·同态律）', `${run.id} IRR ${(r.total.irr * 100).toFixed(3)}% 与回收期 ${r.total.paybackPeriod} 不同态`)
  }

  // ③ IRR 残差：符号夹逼（量纲无关）；宽松残差仅作伴随——直接消费引擎暴露的 mergedFlows
  //    （口径轮前本处用 annualNet 常数年金镜像重建，比真流弱一档）
  const flows = r.total.mergedFlows
  const flowsSum = flows.reduce((a, b) => a + b, 0)
  if (flowsSum > 0 && r.total.totalInvestment > 0) {
    const irr = r.total.irr
    const scale = r.total.totalInvestment + flows.reduce((a, b) => a + Math.abs(b), 0)
    if (!(npv(r.total.totalInvestment, flows, irr - 2e-4) > 0)) fail('③ IRR 符号夹逼', `${run.id} NPV(irr−2e-4) ≤ 0（irr=${irr}）`)
    if (!(npv(r.total.totalInvestment, flows, irr + 2e-4) < 0)) fail('③ IRR 符号夹逼', `${run.id} NPV(irr+2e-4) ≥ 0（irr=${irr}）`)
    if (Math.abs(npv(r.total.totalInvestment, flows, irr)) > 1e-2 * scale) {
      fail('③ IRR 符号夹逼', `${run.id} 宽松残差超限（|NPV|/Σ|流量| > 1%）`)
    }
  }

  // ④ 单系统：total 与唯一分项逐位一致
  if (r.items.length === 1) {
    const it = r.items[0]
    const fields = ['totalInvestment', 'annualRevenue', 'annualNet', 'irr', 'paybackPeriod', 'carbonReduction']
    if (fields.some((f) => r.total[f] !== it[f])) fail('④ 单系统 total===item', `${run.id} total 与分项不一致`)
  }

  // ⑦ 敏感性接线：单系统的平坦轴集合与电价轴方向；points[2]（+0%）与基准精确相等（1+0===1）；
  //    swing（百分点）重算一致。抓「扰动打错字段」——那种错数字都还挺像样
  const singleType = Object.keys(run.systems).length === 1 ? Object.keys(run.systems)[0] : null
  if (singleType && sens && sens.applicable && typeof sens.base.paybackPeriod === 'number') {
    const expectedFlat = {
      pv: 'peakValleySpread',
      storage: 'elecPrice,sunHours',
      cooling: 'peakValleySpread,sunHours',
      charger: 'elecPrice,peakValleySpread,sunHours',
    }[singleType]
    const actualFlat = sens.flat.map((f) => f.key).sort().join(',')
    if (actualFlat !== expectedFlat) fail('⑦ 敏感性接线（平坦轴/方向/基准档）', `${run.id} 平坦轴 ${actualFlat || '（无）'} ≠ 预期 ${expectedFlat}`)
    const elecRow = sens.rows.find((row) => row.key === 'elecPrice')
    if (elecRow) {
      const p0 = elecRow.points[0]
      const p4 = elecRow.points[4]
      if (p0.irr != null && p4.irr != null && typeof p0.paybackPeriod === 'number' && typeof p4.paybackPeriod === 'number') {
        // 光伏收益同向（电价升 IRR 升）；供冷购电成本反向（电价升 IRR 降）
        const expectIncreasing = singleType === 'pv'
        if (expectIncreasing ? !(p0.irr < p4.irr) : !(p0.irr > p4.irr)) {
          fail('⑦ 敏感性接线（平坦轴/方向/基准档）', `${run.id} 电价轴方向不符（${singleType}，−20% ${p0.irr} → +20% ${p4.irr}）`)
        }
      }
    }
    for (const row of sens.rows) {
      const mid = row.points[2]
      if (mid.irr !== sens.base.irr || mid.paybackPeriod !== sens.base.paybackPeriod) {
        fail('⑦ 敏感性接线（平坦轴/方向/基准档）', `${run.id} ${row.key} 轴 +0% 档 ≠ 基准`)
      }
      const swing = Math.max(
        ...row.points.map((p) => (p.irr != null && typeof p.paybackPeriod === 'number' ? Math.abs(p.irr - sens.base.irr) * 100 : 0)),
      )
      if (Math.abs(swing - row.swing) > 1e-9) fail('⑦ 敏感性接线（平坦轴/方向/基准档）', `${run.id} ${row.key} 轴 swing ${row.swing} ≠ 重算 ${swing}`)
    }
  }

  // ⑧ NaN 泄漏：结果与敏感性全部数值字段必须有限
  try {
    finiteWalk(r, `${run.id}.result`)
    if (sens) finiteWalk(sens, `${run.id}.sensitivity`)
  } catch (e) {
    fail('⑧ NaN 泄漏扫描', e.message)
  }

  // ⑩ horizon 截断确实在起作用：合并流长度 = max(寿命)；且「若按全寿命年金算」NPV 明显≠0
  //    （后半句必须有——否则断言是空的，截断与否都绿）
  const types = Object.keys(run.systems)
  if (types.includes('pv') && types.includes('storage') && flowsSum > 0 && r.total.totalInvestment > 0) {
    const horizon = Math.max(...r.items.map((it) => it.years))
    if (flows.length !== horizon) fail('⑩ horizon 截断生效', `${run.id} 合并流长度 ${flows.length} ≠ ${horizon}`)
    const untrunc = Array.from({ length: horizon }, () => r.total.annualNet)
    const npvUntrunc = Math.abs(npv(r.total.totalInvestment, untrunc, r.total.irr))
    if (!(npvUntrunc > 1e-3 * r.total.totalInvestment)) {
      fail('⑩ horizon 截断生效', `${run.id} 全寿命年金口径 NPV(irr) 仅 ${npvUntrunc.toExponential(2)}（截断与否无差别，断言为空）`)
    }
  }
}
console.log(`网格 ${runs.length} 组合 × 敏感性 ${ranSensitivity} 次重算完成`)

// ── ⑤ 线性齐次：无需量时容量 ×2 ⇒ 投资/毛收益/碳减排精确 ×2，IRR 与回收期逐位不变 ──
// 用 === 的依据：乘 2 是 2 的幂，fl(2a op 2b) = 2·fl(a op b)，二分路径完全一致
{
  const c = cfg0()
  for (const [type, scales] of Object.entries(SCALES)) {
    for (const capacity of scales) {
      const a = calculateFeasibility({ systems: { [type]: { enabled: true, capacity } }, province: '广东' }, c).items[0]
      const b = calculateFeasibility({ systems: { [type]: { enabled: true, capacity: capacity * 2 } }, province: '广东' }, c).items[0]
      const ok =
        b.totalInvestment === a.totalInvestment * 2 &&
        b.annualRevenue === a.annualRevenue * 2 &&
        b.carbonReduction === a.carbonReduction * 2 &&
        b.irr === a.irr &&
        b.paybackPeriod === a.paybackPeriod
      if (!ok) fail('⑤ 线性齐次（2 的幂 ⇒ 逐位）', `${type} ${capacity}→${capacity * 2} 齐次性破坏`)
    }
  }
}

// ── ⑥ 需量分段封顶：baseKw 1000，功率 = 容量÷2h，min(功率, 0.1×需量) ──
{
  const c = cfg0()
  const demand = { baseKw: 1000, kva: 315, annualKwh: 982800 }
  const expected = { 100: 50, 199: 99.5, 200: 100, 201: 100, 400: 100 }
  for (const [capacity, shaved] of Object.entries(expected)) {
    const d = calculateFeasibility(
      { systems: { storage: { enabled: true, capacity: Number(capacity) } }, province: '广东', demand },
      c,
    ).items[0].demandDetail
    if (d.shavedKw !== shaved) fail('⑥ 需量分段封顶', `${capacity} kWh → ${d.shavedKw} ≠ ${shaved}`)
  }
}

// ── ⑧b 可选系数逐个删除：兜底路径（?? 1 / ?? 0 / ?? 365）不得产生 NaN ──
{
  for (const key of ['roundTripEfficiency', 'depthOfDischarge', 'availableDaysPerYear', 'degradationPerYear', 'demandShaveRatio', 'demandPricePerKwMonth']) {
    const c = cfg0()
    delete c.storage[key]
    try {
      const r = calculateFeasibility(
        { systems: { storage: { enabled: true, capacity: 1000 } }, province: '广东', demand: DEMANDS[2] },
        c,
      )
      finiteWalk(r, `删 storage.${key}`)
    } catch (e) {
      fail('⑧ NaN 泄漏扫描', `删 storage.${key} 抛错：${e.message}`)
    }
  }
  {
    // pv.degradationPerYear 同为可选兜底（?? 0）——口径轮新增系数，删除后退化恒定年金
    const c = cfg0()
    delete c.pv.degradationPerYear
    try {
      const r = calculateFeasibility({ systems: { pv: { enabled: true, capacity: 2000 } }, province: '广东' }, c)
      finiteWalk(r, '删 pv.degradationPerYear')
    } catch (e) {
      fail('⑧ NaN 泄漏扫描', `删 pv.degradationPerYear 抛错：${e.message}`)
    }
  }
  const c = cfg0()
  delete c.provinces.广东.cyclesPerDay
  try {
    const r = calculateFeasibility({ systems: { storage: { enabled: true, capacity: 1000 } }, province: '广东' }, c)
    finiteWalk(r, '删 provinces.广东.cyclesPerDay')
  } catch (e) {
    fail('⑧ NaN 泄漏扫描', `删 cyclesPerDay 抛错：${e.message}`)
  }
}

// ── ⑨ recommend→finance 联动：每张推荐卡的 estimate 必须等于按 suggestedScale + 该卡 demand
//    直算的单系统结果（逐位）。唯一能抓跨模块 kW/kWh/万㎡/桩 单位串位的检查 ──
const SCENARIOS = [
  { buildingNature: 'existing', buildingType: '办公', area: 10000, province: '广东', annualConsumption: 800000, year: 2018 },
  { buildingNature: 'existing', buildingType: '商场', area: 20000, province: '甘肃', annualConsumption: 5e6, parkingSpots: 60 },
  { buildingNature: 'new', buildingType: '酒店', area: 15000, province: '天津' },
  { buildingNature: 'existing', buildingType: '数据中心', area: 3000, province: '北京', annualConsumption: 2e7 },
  { buildingNature: 'existing', buildingType: '工业厂房', area: 30000, province: '上海', annualConsumption: 6e6, transformerKva: 2000, roofArea: 20000 },
  { buildingNature: 'existing', buildingType: '高校', area: 80000, province: '山西', annualConsumption: 6e6, roofType: '坡屋面' },
]
const allCards = []
{
  const c = cfg0()
  for (const scen of SCENARIOS) {
    const cards = buildRecommendations(scen, c)
    allCards.push(...cards)
    for (const card of cards) {
      const r = calculateFeasibility(
        {
          systems: { [card.key]: { enabled: true, capacity: card.suggestedScale } },
          province: scen.province,
          ...(card.demand ? { demand: card.demand } : {}),
        },
        c,
      )
      const it = r?.items?.[0]
      const ok =
        it &&
        card.estimate &&
        it.totalInvestment === card.estimate.totalInvestment &&
        it.irr === card.estimate.irr &&
        it.paybackPeriod === card.estimate.paybackPeriod &&
        it.carbonReduction === card.estimate.carbonReduction
      if (!ok) fail('⑨ recommend→finance 联动', `${scen.buildingType}@${scen.province} ${card.label} 预估值与直算不一致`)
    }
  }
}

// ── ⑪ 入参边界：形状异常 fail-fast（抛错），无可测算项返回 null，不静默兜底 ──
{
  const c = cfg0()
  const throws = (fn, label) => {
    try {
      fn()
      fail('⑪ 入参边界', `${label} 未抛错`)
    } catch {
      /* 预期 */
    }
  }
  const isNull = (fn, label) => {
    if (fn() !== null) fail('⑪ 入参边界', `${label} 应返回 null`)
  }
  throws(() => calculateFeasibility({}, c), '缺 systems')
  throws(() => calculateFeasibility({ systems: { 未知: { enabled: true, capacity: 100 } }, province: '广东' }, c), '未知类型 + 容量>0')
  isNull(() => calculateFeasibility({ systems: {}, province: '广东' }, c), '空 systems')
  isNull(() => calculateFeasibility({ systems: { pv: { enabled: false, capacity: 1000 } }, province: '广东' }, c), '禁用系统')
  isNull(() => calculateFeasibility({ systems: { pv: { enabled: true, capacity: 0 } }, province: '广东' }, c), '容量 0')
  isNull(() => calculateFeasibility({ systems: { pv: { enabled: true, capacity: '0' } }, province: '广东' }, c), "容量 '0'")
  isNull(() => calculateFeasibility({ systems: { 未知: { enabled: true, capacity: 0 } }, province: '广东' }, c), '未知类型 + 容量 0')
}

// ══════════════════════════════════════════════════════════════════════════
// 疑点段（2026-09-18 审计发现）。①②③ 已随口径轮（同日）修复——本节转为守护断言；
// ④⑤⑥ 仍「只记录不擅改」，修复需先定口径改 CLAUDE.md，改后对应断言会红，红=行为已变
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── 疑点现状（①②③已修守护 / ④⑤⑥钉住供口径轮对照）──')
{
  // ① 口径轮修复后：回收期 = 合并逐年现金流（含衰减）累计穿越投资额，与 IRR 同流同口径。
  //   旧口径「投资 ÷ 全寿命年净」已废弃——储能 10 年到期后不再在分母虚贡献，回收期如实
  //   变长（685 万组合 3.560 → 3.615 年）。全网格镜像守护见上方网格循环
  const c = cfg0()
  const r = calculateFeasibility(
    { systems: { pv: { enabled: true, capacity: 2000 }, storage: { enabled: true, capacity: 1000 } }, province: '广东' },
    c,
  )
  const horizon = Math.max(...r.items.map((it) => it.years))
  console.log(
    `① 光伏+储能：horizon ${horizon} 年，回收期 ${r.total.paybackPeriod.toFixed(3)}（合并流累计穿越）= 与 IRR ${(r.total.irr * 100).toFixed(1)}% 同现金流`,
  )
  if (r.total.paybackPeriod !== crossingOf(r.total.totalInvestment, r.total.mergedFlows)) {
    fail('疑点① 回收期=合并流累计穿越（口径轮已修·守护）', '合计回收期与合并流穿越镜像不一致（口径被改动）')
  }
}
{
  // ② 口径轮后原矛盾结构性消失（IRR>0 ⟺ 回收有解，全网格同态律见上）。本场景原是矛盾
  //    复现点（pv1500+充电200桩·日均 17.9：IRR +0.15% 却 N/A）——衰减口径下未折现总流量
  //    跌破投资额，IRR 转负，与 N/A 同态一致。sensitivity 的 N/A 短路 gate 留待后续轮次
  //    改挂 IRR（届时语义等价，此处仅同步标签）
  const c = cfg0()
  c.charger.dailyKwhPerPile = 17.9
  const r = calculateFeasibility(
    { systems: { pv: { enabled: true, capacity: 1500 }, charger: { enabled: true, capacity: 200 } }, province: '广东' },
    c,
  )
  const sens = buildSensitivity(
    { systems: { pv: { enabled: true, capacity: 1500 }, charger: { enabled: true, capacity: 200 } }, province: '广东' },
    c,
  )
  console.log(`② pv1500+充电200桩（日均 17.9）：年净 ${r.total.annualNet.toFixed(2)} 万 / 回收期 ${r.total.paybackPeriod} / IRR ${(r.total.irr * 100).toFixed(3)}%（三态一致，原矛盾消失）`)
  if (!(r.total.annualNet < 0 && r.total.paybackPeriod === 'N/A' && r.total.irr <= 0 && sens.applicable === false)) {
    fail('疑点② IRR>0 ⟺ 回收期有解（口径轮已修·同态律）', '该场景三态一致性破坏，请核')
  }
}
{
  // ③ 口径轮修复后：负 IRR 与「计算期内永不回收」同态——供冷造价×2 时 IRR −2.04% 且
  //    回收期如实报 N/A（旧口径报数值 25，"永远收不回"却显示 25 年）。负 IRR 的
  //    展示层语义（界面如何呈现负值）属后续轮次，本处只钉引擎层同态
  const c = cfg0()
  c.cooling.capexPerSqm = 600
  const r = calculateFeasibility({ systems: { cooling: { enabled: true, capacity: 1 } }, province: '广东' }, c)
  const it = r.items[0]
  console.log(`③ 供冷造价×2：IRR ${(it.irr * 100).toFixed(2)}% / 回收期 ${it.paybackPeriod}（负 IRR 与 N/A 同态）`)
  if (!(it.irr < 0 && it.paybackPeriod === 'N/A')) {
    fail('疑点③ 负 IRR ⇒ 回收 N/A（口径轮已修·守护）', '负 IRR 态行为已变，请核')
  }
}
{
  // ④ 未收录省静默回退：省名不存在时按 provinces 首键（北京）算完，result.province 仍回显
  //    传入名——错省数字配错省名。界面不可达（下拉框只列合法省），API 层防御缺口
  const c = cfg0()
  const r = calculateFeasibility({ systems: { pv: { enabled: true, capacity: 1000 } }, province: '不存在省' }, c)
  const bj = calculateFeasibility({ systems: { pv: { enabled: true, capacity: 1000 } }, province: '北京' }, c)
  console.log(`④ 未收录省：收益 ${r.total.annualRevenue} === 北京 ${bj.total.annualRevenue}，回显省名「${r.province}」`)
  if (!(r.province === '不存在省' && r.total.annualRevenue === bj.total.annualRevenue)) {
    fail('疑点④ 未收录省静默回退（钉现状）', '回退行为已变（可能已加防御），请核')
  }
}
{
  // ⑤ 既有建筑年电量缺失 → 储能触发依据误挂「新建无负荷数据」文案（recommend.js 的
  //    isNew || !Number.isFinite(annualKwh) 分支）。界面不可达（既有走预估兜底必得数）
  const cards = buildRecommendations({ buildingNature: 'existing', buildingType: '办公', area: 10000, province: '广东' }, cfg0())
  const st = cards.find((card) => card.key === 'storage')
  console.log(`⑤ 既有建筑缺年电量：储能首条依据「${st.reasons.find((s) => s.includes('新建无负荷数据')) ?? '（无）'}」`)
  if (!st.reasons.some((s) => s.includes('新建无负荷数据'))) {
    fail('疑点⑤ 既有建筑误挂新建文案（钉现状）', '文案分支已改，请核')
  }
}
{
  // ⑥ 「暂缓」档默认系数下不可达：全部场景最低分 28（供冷低于门槛档），levelOf 末行死代码。
  //    未破坏功能，仅记录——若未来系数/规则调整使低分可达，此断言会提醒档位语义复活
  const minScore = Math.min(...allCards.map((card) => card.score))
  const levels = new Set(allCards.map((card) => card.level))
  console.log(`⑥ 全场景最低分 ${minScore}，出现档位 ${[...levels].join('/')}${levels.has('暂缓') ? '（暂缓可达！）' : '（暂缓不可达，死档）'}`)
  if (minScore !== 28 || levels.has('暂缓')) {
    fail('疑点⑥ 暂缓档不可达（钉现状）', `最低分 ${minScore}，档位 ${[...levels].join('/')}——档位可达性已变，请复核展示语义`)
  }
}

// ── 收尾 ──
// 模块默认值快照对比：本脚本 delete 过可选系数、覆盖过造价复现疑点——任何一处写穿
// 浅拷贝都会在这里红（初版就栽过：⑧b 删的广东 cyclesPerDay 让疑点① 打出脏数）
if (JSON.stringify({ defaultConfig, defaultBenchmarks }) !== DEFAULTS_SNAPSHOT) {
  fail('自检 模块默认值未被本脚本污染', 'defaultConfig/defaultBenchmarks 与文件头快照不一致——有代码写穿了共享引用，后续所有段落的数据都不可信')
}
console.log('')
let red = 0
for (const id of CHECK_IDS) {
  const msgs = bad[id]
  if (msgs) {
    red += 1
    console.log(`✗ ${id}：${msgs.length} 处（首 3：${msgs.slice(0, 3).join('；')}）`)
  } else {
    console.log(`✓ ${id}`)
  }
}
process.exitCode = red > 0 ? 1 : 0
console.log(red === 0 ? '\n审计通过：不变量与守护项均符合现状（疑点①②③已随口径轮修复，④⑤⑥见上方现状描述）' : `\n审计 ${red} 类异常`)
