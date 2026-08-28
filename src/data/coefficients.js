/**
 * 全局系数注册表 —— 本项目唯一允许存放系数默认值的地方（CLAUDE.md §5 / §9 红线）。
 *
 * 导出两部分：
 *   1. defaultConfig        纯数值嵌套对象：configStore 初始化 + 公式计算读取
 *   2. coefficientSections  专家参数面板的渲染契约（分组 / 标签 / 单位 / 数据来源）
 *
 * 红线：每个系数必须带 source 字段；无真实官方来源的一律标注「演示假设值」。
 */

import { benchmarkTypes } from './benchmarks.js'

export const defaultConfig = {
  // 光伏（规模单位：kW，备案/并网/EPC 报价通行功率口径）
  pv: {
    capexPerWatt: 3.5, // 元/W，工商业分布式初始投资
    performanceRatio: 0.9, // 系统效率 PR（灰尘/线损/逆变器损耗）
    omRatioPerYear: 0.01, // 年运维费占初始投资比例
    lifetimeYears: 25, // 计算期，组件功率质保 25 年
  },
  // 储能（规模单位：kWh，工商业储能柜通行能量口径）；套利收益按分省峰谷价差 × 分时循环折算
  //（价差与循环判定均为公开数据项：provinces.X.peakValleySpread / cyclesPerDay，不在全局写死循环次数）
  storage: {
    capexPerKWh: 1200, // 元/kWh，即 1.2 元/Wh
    cycle2SpreadRatio: 0.5, // 两充两放省第二循环有效价差占全额峰谷价差比例（平充峰放：峰−平 ≈ 半额）
    omRatioPerYear: 0.02,
    lifetimeYears: 10, // 电芯质保 typical 10 年
  },
  // 储能定容参考（公开数据组）：模块① 储能规模双口径推导用，来源见下方 STORAGE_*_SOURCE
  storageSizing: {
    transformerVa: { 办公: 80, 商场: 100, 医院: 80, 酒店: 90, 高校: 40, 数据中心: 1200, 工业厂房: 50 }, // VA/㎡，推定单位面积配变容量
    transformerPowerRatio: 0.25, // 储能功率占变压器容量上限（防倒送与接入口径）
    hours: 2, // h，工商业主流 2 小时系统
    peakShiftRatio: 0.35, // 日均用电量 → 峰段可消纳放电量系数（方案阶段代理）
  },
  // 集中供冷（规模单位：万㎡；能源站 + 管网新建，冷费收益建模，见 utils/finance.js）
  cooling: {
    capexPerSqm: 300, // 元/㎡，能源站 + 管网 + 用户接入的单位投资
    kwhPerSqm: 50, // kWh/㎡·a，年供冷需求密度（冷量）
    coolingPricePerKwh: 0.75, // 元/kWh，集中供冷冷价（按冷量计费）
    copBaseline: 3.0, // 常规分散制冷平均 COP（碳减排对标基准）
    cop: 5.0, // 集中供冷高效机房 COP
    omRatioPerYear: 0.01,
    lifetimeYears: 20, // 能源站主体折旧年限
    // 供冷折算参考（公开数据组）：模块① 集中供冷规模与冷负荷折算用，来源见下方 COOLING_*_SOURCE
    areaRatio: { 办公: 0.8, 商场: 0.9, 医院: 0.8, 酒店: 0.7, 高校: 0.5, 数据中心: 1.0, 工业厂房: 0.4 },
    loadIndex: { 办公: 120, 商场: 200, 医院: 120, 酒店: 95, 高校: 100, 数据中心: 800, 工业厂房: 150 }, // W/㎡，设计估算区间中值，分类型来源见 COOLING_INDEX_SOURCES
  },
  // 充电桩（规模单位：桩；净收益 = 年充电量 × 服务费 ×(1−平台抽成) − 场地等固定成本 − 运维）
  charger: {
    capexPerPile: 50000, // 元/桩，120kW 直流双枪整机 + 安装 + 配电配套
    dailyKwhPerPile: 180, // kWh/桩·日，工商业快充常见利用水平（≈120kW × 1.5h 等效）
    serviceFee: 0.45, // 元/kWh，充电服务费单价（电费代收代付不过账）
    platformCutRatio: 0.15, // 第三方流量平台抽成占服务费比例
    siteCostPerPile: 8000, // 元/桩·年，场地租金 + 运营分摊（固定年成本）
    omRatioPerYear: 0.01, // 设备运维占初始投资比例
    lifetimeYears: 8, // 充电设备迭代快，按 8 年
    // 配建参考（公开数据组）：模块① 充电桩规模推导用，来源见下方 CHARGER_PILES_SOURCE
    pilesPer10kSqm: { 商场: 8, 酒店: 5, 办公: 4, 医院: 4, 高校: 4, 工业厂房: 4, 数据中心: 2 }, // 桩/万㎡
  },
  // 屋面光伏参考（公开数据组）：模块① 光伏规模推导用——可用系数按建筑类型，装机密度与折减按屋面形式
  roof: {
    usableRatio: { 办公: 0.4, 商场: 0.5, 医院: 0.35, 酒店: 0.3, 高校: 0.45, 数据中心: 0.3, 工业厂房: 0.65 },
    types: {
      平屋面: { ratioFactor: 1.0, kwPerSqm: 0.1 },
      坡屋面: { ratioFactor: 0.7, kwPerSqm: 0.13 },
      彩钢屋面: { ratioFactor: 1.0, kwPerSqm: 0.12 },
    },
    bipv: { ratioFactor: 0.9, kwPerSqm: 0.14 }, // 新建 BIPV 一体化满铺口径
  },
  // 分省参数：年等效利用小时 + 工商业电价 + 峰谷价差（面板按省分条列出）。
  // 覆盖大陆 31 个省级单位（22 省 + 5 自治区 + 4 直辖市），按华北→东北→华东→华中→华南→西南→西北排列；
  // 省内价区差异（如深圳 vs 广东其余、蒙西 vs 蒙东）不建模，取省量级，用户可在公开数据抽屉按项目地微调。
  // peakValleySpread 为真实数据：电网代理购电（一般工商业 1-10kV）峰谷价差，月份见下方 SPREAD_AS_OF 常量，
  // 取单一制与两部制标准档较高者、不含 1.5 倍上浮档（省内多价区如广东取珠三角五市档）；
  // 未收录的 6 省按演示假设值兜底——来源见下方 SPREAD_SOURCE / SPREAD_FALLBACK_SOURCE。
  // cyclesPerDay 为分时结构判定（1=一充一放，2=两充两放；结构性事实而非可调经验系数）：
  // 时段结构支持两充两放的 8 省取 2，其余保守按 1 计——来源见下方 CYCLES_SOURCE，统计窗口见 CYCLES_AS_OF
  provinces: {
    北京: { sunHours: 1200, elecPrice: 0.8, peakValleySpread: 0.7248, cyclesPerDay: 1 },
    天津: { sunHours: 1200, elecPrice: 0.78, peakValleySpread: 0.8378, cyclesPerDay: 2 }, // 两充两放
    上海: { sunHours: 1050, elecPrice: 0.85, peakValleySpread: 1.0937, cyclesPerDay: 1 },
    重庆: { sunHours: 850, elecPrice: 0.68, peakValleySpread: 1.0816, cyclesPerDay: 1 },
    河北: { sunHours: 1300, elecPrice: 0.65, peakValleySpread: 0.75, cyclesPerDay: 1 }, // 冀北 0.7175，取南网主体档
    山西: { sunHours: 1350, elecPrice: 0.55, peakValleySpread: 0.4638, cyclesPerDay: 1 },
    内蒙古: { sunHours: 1550, elecPrice: 0.5, peakValleySpread: 0.4676, cyclesPerDay: 1 }, // 蒙东档
    辽宁: { sunHours: 1250, elecPrice: 0.65, peakValleySpread: 0.4352, cyclesPerDay: 1 },
    吉林: { sunHours: 1300, elecPrice: 0.62, peakValleySpread: 0.6, cyclesPerDay: 2 }, // 演示假设值兜底；两充两放
    黑龙江: { sunHours: 1300, elecPrice: 0.6, peakValleySpread: 0.3071, cyclesPerDay: 1 },
    江苏: { sunHours: 1100, elecPrice: 0.82, peakValleySpread: 0.6476, cyclesPerDay: 2 }, // 100kVA 及以上档；两充两放
    浙江: { sunHours: 1050, elecPrice: 0.85, peakValleySpread: 0.7849, cyclesPerDay: 2 }, // 两充两放
    安徽: { sunHours: 1100, elecPrice: 0.7, peakValleySpread: 0.8167, cyclesPerDay: 1 }, // 两部制档
    福建: { sunHours: 1150, elecPrice: 0.68, peakValleySpread: 0.5379, cyclesPerDay: 1 },
    江西: { sunHours: 1100, elecPrice: 0.7, peakValleySpread: 0.6134, cyclesPerDay: 2 }, // 两充两放
    山东: { sunHours: 1250, elecPrice: 0.7, peakValleySpread: 0.846, cyclesPerDay: 1 }, // 四档同值；深谷段结构未获名单确认，保守按一充一放
    河南: { sunHours: 1200, elecPrice: 0.68, peakValleySpread: 0.6, cyclesPerDay: 1 }, // 演示假设值兜底
    湖北: { sunHours: 1050, elecPrice: 0.72, peakValleySpread: 0.5898, cyclesPerDay: 2 }, // 两充两放
    湖南: { sunHours: 1000, elecPrice: 0.72, peakValleySpread: 0.6, cyclesPerDay: 2 }, // 演示假设值兜底；两充两放
    广东: { sunHours: 1050, elecPrice: 0.75, peakValleySpread: 1.2655, cyclesPerDay: 2 }, // 珠三角五市档；两充两放
    广西: { sunHours: 1100, elecPrice: 0.65, peakValleySpread: 0.3629, cyclesPerDay: 1 },
    海南: { sunHours: 1250, elecPrice: 0.8, peakValleySpread: 0.6, cyclesPerDay: 1 }, // 演示假设值兜底
    四川: { sunHours: 850, elecPrice: 0.65, peakValleySpread: 0.631, cyclesPerDay: 1 }, // 两部制档
    贵州: { sunHours: 950, elecPrice: 0.6, peakValleySpread: 0.7053, cyclesPerDay: 1 }, // 两部制档；二充窗口仅 1h，保守按一充一放
    云南: { sunHours: 1400, elecPrice: 0.55, peakValleySpread: 0.6, cyclesPerDay: 1 }, // 演示假设值兜底
    西藏: { sunHours: 1900, elecPrice: 0.55, peakValleySpread: 0.6, cyclesPerDay: 1 }, // 演示假设值兜底
    陕西: { sunHours: 1300, elecPrice: 0.6, peakValleySpread: 0.7315, cyclesPerDay: 1 }, // 两部制档，含/不含榆林同值
    甘肃: { sunHours: 1500, elecPrice: 0.5, peakValleySpread: 0.1461, cyclesPerDay: 1 }, // 全国最低
    青海: { sunHours: 1650, elecPrice: 0.45, peakValleySpread: 0.2818, cyclesPerDay: 1 },
    宁夏: { sunHours: 1550, elecPrice: 0.45, peakValleySpread: 0.1557, cyclesPerDay: 1 },
    新疆: { sunHours: 1500, elecPrice: 0.45, peakValleySpread: 0.2568, cyclesPerDay: 1 },
  },
  // 通用系数
  general: {
    gridEmissionFactor: 0.5366, // tCO₂/MWh，全国电网平均
    discountRate: 0.06, // 财务评价折现率
  },
}

// ── 数据日期常量（年更编辑点：峰谷价差换月只改 SPREAD_AS_OF、分省电价换年只改 ELECP_AS_OF、
//    分时结构名单换版只改 CYCLES_AS_OF，所有来源句与界面提示自动收敛，不再散落多处手改） ──
export const SPREAD_AS_OF = '2026年8月' // 峰谷价差：电网代理购电月度表所属月份
export const ELECP_AS_OF = '2024–2025' // 分省电价：工商业购电水平大致区间
export const CYCLES_AS_OF = '2025年1-7月' // 分时结构：分省两充两放名单所属统计窗口（建议按季度复核名单）

// 分省参数的分组来源说明（各注各的，避免两组共用一条互相夹带无关半句）
const PROVINCE_SUN_SOURCE = '演示假设值：利用小时参考中国气象局太阳能资源区划典型区间'
const PROVINCE_PRICE_SOURCE = `演示假设值：电价参考 ${ELECP_AS_OF} 各省工商业购电大致水平`

// 分省峰谷价差来源（真实数据，独立公开数据项）：储能头条/国际能源网按月汇总自国网、南网分省公告
const SPREAD_SOURCE = `储能头条/国际能源网《${SPREAD_AS_OF}电网代理购电价格》：一般工商业 1-10kV，取单一制与两部制标准档较高者（不含 1.5 倍上浮档）`
// 该月表未收录的省份 → 演示假设值兜底（红线：不编造数据），后续月度表出数后替换
const SPREAD_MISSING = new Set(['吉林', '河南', '湖南', '海南', '云南', '西藏'])
const SPREAD_FALLBACK_SOURCE = `演示假设值：${SPREAD_AS_OF}代理购电表未收录该省，暂按已收录 25 省中位水平取整 0.60 元/kWh 兜底`

// 分时循环判定来源（真实数据，独立公开数据项）：按分时时段窗口逐省判定，非价差水平的推论
const CYCLES_SOURCE = `中国能源研究会储能专委会/储能头条 2025 上半年分时电价盘点（${CYCLES_AS_OF}统计窗口）：时段结构支持两充两放的 8 省（浙江/广东/江苏/湖北/湖南/吉林/江西/天津）取 2，其余按一充一放保守计（贵州二充窗口仅 1 小时、山东深谷段结构未获名单确认，均计 1）；各省分时时段年内仍会调整，决策前需核当月文件`

// 年运维比例 / 计算期的统一来源说明
const OM_SOURCE = '演示假设值：年运维费占初始投资比例，按行业运维报价量级'
const LIFE_SOURCE = (years, basis) => `演示假设值：计算期 ${years} 年（${basis}）`

// ── 经验参考表（公开数据组）：屋面 / 供冷折算 / 充电桩配建——查表经验值，模块① 推荐引擎读取 ──
const refField = (path, label, unit, step, source) => ({ path, label, unit, step, source })
const ROOF_RATIO_SOURCE = '演示假设值：屋顶可用面积占建筑面积比例（低层大屋面商场高于高层办公/医院）'
const ROOF_TYPE_SOURCE =
  '演示假设值：屋面形式对可用比例与装机密度的影响（平屋面支架阵列留检修间距；坡屋面顺坡满铺密度高但仅计有效朝向坡面；彩钢夹具直贴），量级参考分布式设计手册典型区间'
const BIPV_SOURCE =
  '演示假设值：新建 BIPV 一体化满铺口径（屋面即组件，覆盖率与装机密度均高于支架式加装，增量成本低于既有加装）'
const COOLING_RATIO_SOURCE =
  '演示假设值：供冷面积占建筑面积比例（扣除车库/设备机房/后勤库房等非供冷区域），参考可研惯例区间取中值'
// 负荷指标分类型来源：民用挂手册区间中值，数据中心按 IT 密度，工业厂房如实降级；
// 「指标法仅方案阶段估算」的通用口径放供冷折算参考分组 hint（说明处），不逐字段重复
const COOLING_INDEX_SOURCES = {
  办公: '《实用供热空调设计手册》冷负荷估算区间中值（办公 90~150 W/㎡）',
  商场: '《实用供热空调设计手册》冷负荷估算区间中值（商场 150~250 W/㎡）',
  医院: '《实用供热空调设计手册》冷负荷估算区间中值（医院 100~150 W/㎡）',
  酒店: '《实用供热空调设计手册》冷负荷估算区间中值（酒店 80~110 W/㎡）',
  高校: '《实用供热空调设计手册》冷负荷估算区间中值（高校 80~150 W/㎡）',
  数据中心: '按 IT 密度 600~1500 W/㎡，取偏保守中值 800',
  工业厂房:
    '面积指标法先天粗糙（舒适性约 100 / 一般空调厂房 150~250 / 洁净厂房 300~500），150 仅作量级粗估，实际以工艺资料逐项计算为准（GB 50019-2015）',
}
const CHARGER_PILES_SOURCE = '演示假设值：按建筑类型的充电桩配建水平（桩/万㎡），需车位与流量确认'
const TRANSFORMER_VA_SOURCE =
  '单位面积配变容量指标（VA/㎡）：民用建筑参考《全国民用建筑工程设计技术措施—电气》惯例区间取中值（办公 60~100、商场 80~120、酒店 80~100）；医院/高校/数据中心/工业厂房区间宽，取综合中值为演示假设值；实填报装容量后以实值为准'
const STORAGE_SIZING_SOURCE =
  '演示假设值：储能功率按变压器容量 25% 上限（防倒送与接入口径），2h 系统为工商业主流配置；峰段可转移系数 0.35 为日均用电量 → 峰段可消纳放电量的方案阶段代理'

// 分省参数面板区（scope: public）：按「利用小时 / 电价 / 峰谷价差」拆组，组内字段标签只留省名；
// indexed: true 标记组内为省名字段 → 面板按拼音首字母分组渲染并挂右缘索引条；
// source 可按字段覆盖（峰谷价差的兜底省单独标注，不与真实数据混淆）
const provinceField = (prov, key, unit, step, source) => ({
  path: `provinces.${prov}.${key}`,
  label: prov,
  unit,
  step,
  source,
})

const provinceSections = [
  {
    scope: 'public',
    title: '分省年等效利用小时',
    hint: '各省太阳能资源差异，直接影响光伏发电量测算',
    indexed: true,
    fields: Object.keys(defaultConfig.provinces).map((prov) =>
      provinceField(prov, 'sunHours', 'h', 10, PROVINCE_SUN_SOURCE),
    ),
  },
  {
    scope: 'public',
    title: '分省工商业电价',
    hint: '各省工商业购电价格，影响发电收益 / 购电成本测算',
    indexed: true,
    fields: Object.keys(defaultConfig.provinces).map((prov) =>
      provinceField(prov, 'elecPrice', '元/kWh', 0.01, PROVINCE_PRICE_SOURCE),
    ),
  },
  {
    scope: 'public',
    title: '分省峰谷价差',
    hint: `一般工商业 1-10kV 峰谷价差（${SPREAD_AS_OF}代理购电），直接决定储能套利收益`,
    indexed: true,
    fields: Object.keys(defaultConfig.provinces).map((prov) =>
      provinceField(
        prov,
        'peakValleySpread',
        '元/kWh',
        0.01,
        SPREAD_MISSING.has(prov) ? SPREAD_FALLBACK_SOURCE : SPREAD_SOURCE,
      ),
    ),
  },
  {
    scope: 'public',
    title: '分省分时结构',
    hint: `一般工商业分时电价时段结构判定：2 = 支持两充两放（第二循环按折价计入收益），1 = 按一充一放；口径截至 ${CYCLES_AS_OF}，各省时段年内仍会调整`,
    indexed: true,
    fields: Object.keys(defaultConfig.provinces).map((prov) =>
      provinceField(prov, 'cyclesPerDay', '次/天', 1, CYCLES_SOURCE),
    ),
  },
]

// 专家参数面板的完整分组契约（benchmarks 分组在 data/benchmarks.js 中定义后并入）。
// scope 决定面板页签归属：expert = 专家参数（系统可调系数）；public = 公开平台数据参考
export const coefficientSections = [
  {
    scope: 'expert',
    title: '光伏',
    fields: [
      {
        path: 'pv.capexPerWatt',
        label: '单位造价',
        unit: '元/W',
        step: 0.1,
        source: '演示假设值：2025 年工商业分布式光伏 EPC 常见区间 3.0–4.0 元/W',
      },
      {
        path: 'pv.performanceRatio',
        label: '系统效率 PR（小数）',
        unit: '',
        step: 0.01,
        source: '演示假设值：含灰尘、线损、逆变器损耗的综合系统效率',
      },
      {
        path: 'pv.omRatioPerYear',
        label: '年运维比例（小数）',
        unit: '',
        step: 0.002,
        source: OM_SOURCE,
      },
      {
        path: 'pv.lifetimeYears',
        label: '计算期',
        unit: '年',
        step: 1,
        source: LIFE_SOURCE(25, '组件功率质保 25 年，行业通行'),
      },
    ],
  },
  {
    scope: 'expert',
    title: '储能',
    fields: [
      {
        path: 'storage.capexPerKWh',
        label: '单位容量造价',
        unit: '元/kWh',
        step: 50,
        source: '演示假设值：2025 年工商业储能系统常见区间 800–1,200 元/kWh（即 0.8–1.2 元/Wh）',
      },
      {
        path: 'storage.cycle2SpreadRatio',
        label: '第二循环价差比（小数）',
        unit: '',
        step: 0.05,
        source:
          '演示假设值：两充两放省第二循环按平充峰放计，有效价差约为全额峰谷价差一半（峰−平 ≈ 半额）；循环次数按分省分时结构判定（公开数据抽屉），不在此全局设定',
      },
      {
        path: 'storage.omRatioPerYear',
        label: '年运维比例（小数）',
        unit: '',
        step: 0.002,
        source: OM_SOURCE,
      },
      {
        path: 'storage.lifetimeYears',
        label: '计算期',
        unit: '年',
        step: 1,
        source: LIFE_SOURCE(10, '电芯质保常见 10 年'),
      },
    ],
  },
  {
    scope: 'expert',
    title: '集中供冷',
    hint: '能源站 + 管网新建，按冷量计费：冷价 × 年供冷量 −（购电成本）',
    fields: [
      {
        path: 'cooling.capexPerSqm',
        label: '单位面积投资',
        unit: '元/㎡',
        step: 20,
        source: '演示假设值：能源站 + 管网 + 用户接入的投资量级',
      },
      {
        path: 'cooling.kwhPerSqm',
        label: '年供冷需求密度',
        unit: 'kWh/㎡·a',
        step: 5,
        source: '演示假设值：公共建筑年供冷需求（冷量）典型值',
      },
      {
        path: 'cooling.coolingPricePerKwh',
        label: '冷价',
        unit: '元/kWh',
        step: 0.05,
        source: '演示假设值：集中供冷项目按冷量计价常见 0.6–0.9 元/kWh',
      },
      {
        path: 'cooling.copBaseline',
        label: '分散制冷 COP（基准）',
        unit: '',
        step: 0.1,
        source: '演示假设值：常规分散制冷机房平均能效（碳减排对标基准）',
      },
      {
        path: 'cooling.cop',
        label: '集中供冷 COP',
        unit: '',
        step: 0.1,
        source: '演示假设值：高效机房设计工况 COP 5.0–6.0',
      },
      {
        path: 'cooling.omRatioPerYear',
        label: '年运维比例（小数）',
        unit: '',
        step: 0.002,
        source: OM_SOURCE,
      },
      {
        path: 'cooling.lifetimeYears',
        label: '计算期',
        unit: '年',
        step: 1,
        source: LIFE_SOURCE(20, '能源站主体折旧年限'),
      },
    ],
  },
  {
    scope: 'expert',
    title: '充电桩',
    hint: '按桩数建模：年充电量 = 桩数 × 单桩日均 × 365；净收益 = 充电量 × 服务费 ×(1−抽成) − 场地成本 − 运维',
    fields: [
      {
        path: 'charger.capexPerPile',
        label: '单桩造价',
        unit: '元/桩',
        step: 5000,
        source: '演示假设值：120kW 直流双枪整机 + 安装 + 配电配套',
      },
      {
        path: 'charger.dailyKwhPerPile',
        label: '单桩日均充电量',
        unit: 'kWh/桩·日',
        step: 20,
        source: '演示假设值：≈120kW × 1.5h 等效日利用（工商业快充常见水平）',
      },
      {
        path: 'charger.serviceFee',
        label: '服务费单价',
        unit: '元/kWh',
        step: 0.05,
        source: '演示假设值：各地充电服务费常见 0.3–0.6 元/kWh，电费代收代付不过账',
      },
      {
        path: 'charger.platformCutRatio',
        label: '平台抽成比例（小数）',
        unit: '',
        step: 0.01,
        source: '演示假设值：第三方流量平台抽服务费 10%–20%',
      },
      {
        path: 'charger.siteCostPerPile',
        label: '场地等固定成本',
        unit: '元/桩·年',
        step: 1000,
        source: '演示假设值：场地租金 + 运营分摊量级',
      },
      {
        path: 'charger.omRatioPerYear',
        label: '设备运维比例（小数）',
        unit: '',
        step: 0.002,
        source: OM_SOURCE,
      },
      {
        path: 'charger.lifetimeYears',
        label: '计算期',
        unit: '年',
        step: 1,
        source: LIFE_SOURCE(8, '充电设备迭代快，按 8 年'),
      },
    ],
  },
  ...provinceSections,
  {
    scope: 'public',
    title: '通用系数',
    fields: [
      {
        path: 'general.gridEmissionFactor',
        label: '电网排放因子',
        unit: 'tCO₂/MWh',
        step: 0.0001,
        source: '生态环境部《2022 年电力二氧化碳排放因子》全国平均值 0.5366',
      },
      {
        path: 'general.discountRate',
        label: '折现率（小数）',
        unit: '',
        step: 0.005,
        source: '演示假设值：能源项目财务评价常用基准折现率 6%',
      },
    ],
  },
  {
    scope: 'public',
    title: '屋面光伏参考',
    hint: '屋面可用系数按建筑类型，装机密度与可用折减按屋面形式；模块① 光伏规模推导用',
    fields: [
      ...benchmarkTypes.map((t) =>
        refField(`roof.usableRatio.${t.key}`, `${t.label}可用系数`, '', 0.05, ROOF_RATIO_SOURCE),
      ),
      refField('roof.types.平屋面.ratioFactor', '平屋面·可用折减', '', 0.05, ROOF_TYPE_SOURCE),
      refField('roof.types.平屋面.kwPerSqm', '平屋面·装机密度', 'kW/㎡', 0.01, ROOF_TYPE_SOURCE),
      refField('roof.types.坡屋面.ratioFactor', '坡屋面·可用折减', '', 0.05, ROOF_TYPE_SOURCE),
      refField('roof.types.坡屋面.kwPerSqm', '坡屋面·装机密度', 'kW/㎡', 0.01, ROOF_TYPE_SOURCE),
      refField('roof.types.彩钢屋面.ratioFactor', '彩钢屋面·可用折减', '', 0.05, ROOF_TYPE_SOURCE),
      refField('roof.types.彩钢屋面.kwPerSqm', '彩钢屋面·装机密度', 'kW/㎡', 0.01, ROOF_TYPE_SOURCE),
      refField('roof.bipv.ratioFactor', 'BIPV·覆盖率', '', 0.05, BIPV_SOURCE),
      refField('roof.bipv.kwPerSqm', 'BIPV·装机密度', 'kW/㎡', 0.01, BIPV_SOURCE),
    ],
  },
  {
    scope: 'public',
    title: '供冷折算参考',
    hint: '供冷面积占比与设计冷负荷指标（W/㎡），模块① 集中供冷规模与冷负荷折算用；指标为方案阶段估算法，施工图须逐时逐项计算',
    fields: [
      ...benchmarkTypes.map((t) =>
        refField(`cooling.areaRatio.${t.key}`, `${t.label}供冷占比`, '', 0.05, COOLING_RATIO_SOURCE),
      ),
      ...benchmarkTypes.map((t) =>
        refField(`cooling.loadIndex.${t.key}`, `${t.label}负荷指标`, 'W/㎡', 10, COOLING_INDEX_SOURCES[t.key] ?? '演示假设值：设计冷负荷指标典型值'),
      ),
    ],
  },
  {
    scope: 'public',
    title: '充电桩配建参考',
    hint: '按建筑类型的充电桩配建水平（桩/万㎡），模块① 充电桩规模推导用',
    fields: benchmarkTypes.map((t) =>
      refField(`charger.pilesPer10kSqm.${t.key}`, `${t.label}配建`, '桩/万㎡', 1, CHARGER_PILES_SOURCE),
    ),
  },
  {
    scope: 'public',
    title: '储能定容参考',
    hint: '模块① 储能规模双口径推导：变压器口径（推定或实填容量 × 功率占比上限 × 系统小时数）与负荷口径（日均用电量 × 峰段可转移系数）取短板；仅为方案阶段估算法',
    fields: [
      ...benchmarkTypes.map((t) =>
        refField(`storageSizing.transformerVa.${t.key}`, `${t.label}配变指标`, 'VA/㎡', 10, TRANSFORMER_VA_SOURCE),
      ),
      refField('storageSizing.transformerPowerRatio', '功率占比上限', '', 0.05, STORAGE_SIZING_SOURCE),
      refField('storageSizing.hours', '系统小时数', 'h', 0.5, STORAGE_SIZING_SOURCE),
      refField('storageSizing.peakShiftRatio', '峰段可转移系数', '', 0.05, STORAGE_SIZING_SOURCE),
    ],
  },
]
