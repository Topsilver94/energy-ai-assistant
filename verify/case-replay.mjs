// 案例级外部对照复演（诊断件，不进 CI 主链路——同 numeric-audit 定位；季度换版/系数调整后重跑）。
// 与 external-anchors.md（参数级）互补：那边对照「单位系数 vs 公开均价」，这边把 5 个公开标杆案例
// 的实际规模喂进 calculateFeasibility，对照「整案输出 vs 实际投资/IRR」。
//
// 判定口径（先讲清，防止误读）：
//   - 本脚本测「工具 vs 外部世界」。外部案例数据钉在脚本里（来源与日期逐案注明），工具侧随
//     coefficients.js 换版而变——重跑即得新对照，这正是它的用途（换版后的回归证据）。
//   - 失败 = 机械性失败（抛错 / 数值非有限 / 模块默认值被污染）。偏差本身不是失败：
//     工具投资是设备 EPC 口径，实际项目总投资常含土地/并网/管理费，单位投资（元/W、元/Wh）
//     可比性最高——偏差方向与大小的「归因」写在 verify/case-replay.md，不在本脚本内判生死。
//   - C4 是唯一收益侧对照（研报披露 IRR），两条腿：研报口径重放（钉 capex/价差/循环/寿命，
//     与现行默认解耦，换版不漂移）+ 2026 现行口径（展示工具今天怎么说）。
//
// 纪律（承 numeric-audit 实测教训）：改系数一律 structuredClone 深拷贝——浅拷贝的嵌套对象与
// 模块单例共享引用，本脚本的研报口径覆写会写穿 defaultConfig 污染后续所有案例。
// 文首尾快照自检兜底。
import { defaultConfig } from '../src/data/coefficients.js'
import { calculateFeasibility } from '../src/utils/finance.js'

const DEFAULTS_SNAPSHOT = JSON.stringify(defaultConfig)
const cfg0 = () => structuredClone({ ...defaultConfig })

const cases = []

// ─── C1 云南红河 80MW 工商业分布式光伏 EPC（2026-03 中标公示，2.50 元/W）───
// 来源：新浪财经《2.5元/W！云南80MW分布式光伏EPC中标结果公示》（中建二局三建中标）
// 口径：分布式工商业 EPC 总承包——与工具 pv.capexPerWatt 同为工商业分布式初始投资口径
{
  const kw = 80_000
  const actual = 80 * 2.5 * 100 // MW × 元/W × 100 = 万元（80MW × 2.50元/W = 20,000万）
  const r = calculateFeasibility({ systems: { pv: { enabled: true, capacity: kw } }, province: '云南' }, cfg0())
  cases.push({
    id: 'C1',
    name: '云南红河 80MW 工商业分布式 EPC（2026-03）',
    system: 'pv',
    actualInvest: actual,
    toolInvest: r.items[0].totalInvestment,
    actualUnit: '2.50 元/W',
    toolUnit: '3.00 元/W',
    note: '大型化工商业分布式，2026 年价格带下沿',
  })
}

// ─── C2 广西 20MW 工商业分布式光伏 EPC（2026-07，3.575 元/W）───
// 来源：SMM 光伏快讯（external-anchors.md 已收录同一证据）
{
  const kw = 20_000
  const actual = 20 * 3.575 * 100 // 20MW × 3.575元/W = 7,150万
  const r = calculateFeasibility({ systems: { pv: { enabled: true, capacity: kw } }, province: '广西' }, cfg0())
  cases.push({
    id: 'C2',
    name: '广西 20MW 工商业分布式 EPC（2026-07）',
    system: 'pv',
    actualInvest: actual,
    toolInvest: r.items[0].totalInvestment,
    actualUnit: '3.575 元/W',
    toolUnit: '3.00 元/W',
    note: '工商业屋顶，2026 年价格带上沿',
  })
}

// ─── C3 浙江汇能科技 2025 储能备案集群（116.116MWh / 超 9289 万元 ≈ 0.80 元/Wh）───
// 来源：行家说储能《2026年储能新周期！近30家企业已就绪》（2025-12-26）
// 口径：备案总投资（集群口径，含配电/施工等），对照工具 0.85 元/Wh 含安装交付口径——带内可比
{
  const kwh = 116_116
  const actual = 9289
  const r = calculateFeasibility({ systems: { storage: { enabled: true, capacity: kwh } }, province: '浙江' }, cfg0())
  cases.push({
    id: 'C3',
    name: '浙江汇能 2025 备案集群 116.116MWh（2025-12）',
    system: 'storage',
    actualInvest: actual,
    toolInvest: r.items[0].totalInvestment,
    actualUnit: '≈0.80 元/Wh（9289万/116.116MWh）',
    toolUnit: '0.85 元/Wh',
    toolIrr: r.items[0].irr,
    toolPayback: r.items[0].paybackPeriod,
    note: '备案集群口径；收益侧无外部披露，IRR 仅作工具侧输出记录',
  })
}

// ─── C4 浙江晶科 3MW/6.88MWh 用户侧储能（2023-01 券商研报全披露模型）───
// 来源：东方财富研报库《工商业储能：三大驱动力》：投资 2 元/Wh（1376万）、峰谷价差 0.93、
//       两充两放年 660 次循环、寿命 11 年 ⇒ 研报 IRR 16.45%
// 腿 A 研报口径：钉 capex=2000 / spread=0.93 / cycle2SpreadRatio=1（研报全循环口径）/
//       days=330 / lifetime=11，其余走工具默认（DoD 0.9、RTE 0.88、充电损耗电价 0.3、运维 2%、
//       衰减 2.5%/年——2026-09 口径轮起读默认，衰减默认值换版时腿 A 随之刷新）
//       ——与现行 capex 换版解耦；残余偏差（+2.4pp）归因 = 研报更保守的运维/充电成本计提
// 腿 B 现行口径：全默认跑同一规模，展示工具 2026-09 的说法（capex 0.85、浙江价差 0.6893）
{
  const kwh = 6_880
  const REPORT_IRR = 0.1645
  const legA = cfg0()
  legA.provinces.浙江.peakValleySpread = 0.93
  legA.storage.capexPerKWh = 2000
  legA.storage.cycle2SpreadRatio = 1
  legA.storage.availableDaysPerYear = 330
  legA.storage.lifetimeYears = 11
  const a = calculateFeasibility({ systems: { storage: { enabled: true, capacity: kwh } }, province: '浙江' }, legA)
  const b = calculateFeasibility({ systems: { storage: { enabled: true, capacity: kwh } }, province: '浙江' }, cfg0())
  cases.push({
    id: 'C4',
    name: '浙江晶科 3MW/6.88MWh 研报全模型（2023-01）',
    system: 'storage',
    actualInvest: 1376,
    toolInvest: a.items[0].totalInvestment,
    actualUnit: '2.00 元/Wh（研报假设）',
    toolUnit: '2.00 元/Wh（钉研报值）',
    reportIrr: REPORT_IRR,
    legA: {
      invest: a.items[0].totalInvestment,
      annualNet: a.items[0].annualNet,
      irr: a.items[0].irr,
      payback: a.items[0].paybackPeriod,
      irrDeltaPp: (a.items[0].irr - REPORT_IRR) * 100,
    },
    legB: {
      invest: b.items[0].totalInvestment,
      irr: b.items[0].irr,
      payback: b.items[0].paybackPeriod,
    },
    note: '唯一收益侧对照：腿 A 复现研报口径，腿 B 为工具现行口径',
  })
}

// ─── C5 浙江高灵能源冰蓄冷空调工程（2011，12.5 万㎡ / 设计冷负荷 13360 kW / 总投资 1673.7 万）───
// 来源：中国经济网《高灵能源某冰蓄冷空调工程案例节能技术分析》（2011-11-30）
// 口径边界（重要，如实记录）：楼内冰蓄冷中央空调机房口径 ≠ 工具「能源站+管网+用户接入」区域
// 供冷口径，且为 2011 年造价——本例是 cooling 系数（external-anchors 判定「公开无稳定同口径均价」
// 未锚定）的首个外部数量级参照，不构成对 300 元/㎡ 的判定
{
  const areaWanSqm = 12.5
  const actual = 1673.7
  const r = calculateFeasibility(
    { systems: { cooling: { enabled: true, capacity: areaWanSqm } }, province: '浙江' },
    cfg0(),
  )
  cases.push({
    id: 'C5',
    name: '浙江高灵冰蓄冷 12.5 万㎡（2011）',
    system: 'cooling',
    actualInvest: actual,
    toolInvest: r.items[0].totalInvestment,
    actualUnit: '133.9 元/㎡（1673.7万/12.5万㎡）',
    toolUnit: '300 元/㎡',
    actualLoadIndex: 13360 / (12.5 * 1e4) * 1000, // W/㎡，设计冷负荷口径
    note: '楼内机房 + 2011 年造价，双口径时代差——仅数量级参照',
  })
}

// ─── 汇总输出 ───
const pct = (tool, actual) => ((tool - actual) / actual) * 100
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : String(v))

console.log('═══ 案例级复演：工具投资 vs 公开案例实际（正偏差 = 工具高估）═══\n')
for (const c of cases) {
  const dev = pct(c.toolInvest, c.actualInvest)
  console.log(`${c.id} ${c.name}`)
  console.log(`   实际 ${c.actualInvest.toLocaleString()} 万（${c.actualUnit}） · 工具 ${c.toolInvest.toFixed(1)} 万（${c.toolUnit}） ⇒ 偏差 ${dev >= 0 ? '+' : ''}${fmt(dev)}%`)
  if (c.legA) {
    console.log(`   腿A 研报口径：年净 ${c.legA.annualNet.toFixed(1)} 万 · IRR ${(c.legA.irr * 100).toFixed(1)}% vs 研报 ${(c.reportIrr * 100).toFixed(2)}%（Δ ${c.legA.irrDeltaPp >= 0 ? '+' : ''}${fmt(c.legA.irrDeltaPp)}pp）· 回收 ${fmt(c.legA.payback)} 年`)
    console.log(`   腿B 现行口径：投资 ${c.legB.invest.toFixed(1)} 万 · IRR ${(c.legB.irr * 100).toFixed(1)}% · 回收 ${fmt(c.legB.payback)} 年`)
  }
  if (c.toolIrr !== undefined) {
    console.log(`   工具侧输出：IRR ${(c.toolIrr * 100).toFixed(1)}% · 回收 ${fmt(c.toolPayback)} 年（无外部收益对照，仅记录）`)
  }
  if (c.actualLoadIndex !== undefined) {
    console.log(`   案例 ${fmt(c.actualLoadIndex, 0)} W/㎡ vs 工具模块① 商场折算 200 W/㎡`)
  }
  console.log(`   ${c.note}\n`)
}

// 机械性失败判定：数值非有限 / 默认值被污染（偏差是发现，不是失败）
const mechFail = []
for (const c of cases) {
  if (!Number.isFinite(c.toolInvest) || c.toolInvest <= 0) mechFail.push(`${c.id} 工具投资异常`)
  if (c.legA && !Number.isFinite(c.legA.irr)) mechFail.push('C4 腿A IRR 异常')
}
if (JSON.stringify(defaultConfig) !== DEFAULTS_SNAPSHOT) {
  mechFail.push('模块默认值被本脚本污染（浅拷贝写穿——检查 cfg0 是否 structuredClone）')
}
if (mechFail.length) {
  console.error('✗ 机械性失败：', mechFail.join('；'))
  process.exitCode = 1
} else {
  console.log('✓ 复演完成（5 案例），模块默认值未污染')
}

import fs from 'node:fs'
import path from 'node:path'
fs.writeFileSync(path.join(import.meta.dirname, 'out', 'case-replay.json'), JSON.stringify(cases, null, 2))
