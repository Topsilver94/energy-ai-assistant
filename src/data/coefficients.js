/**
 * 全局系数注册表 —— 本项目唯一允许存放系数默认值的地方（CLAUDE.md §5 / §9 红线）。
 *
 * 导出两部分：
 *   1. defaultConfig        纯数值嵌套对象：configStore 初始化 + 公式计算读取
 *   2. coefficientSections  专家参数面板的渲染契约（分组 / 标签 / 单位 / 数据来源）
 *
 * 红线：每个系数必须带 source 字段；无真实官方来源的一律标注「演示假设值」。
 */

export const defaultConfig = {
  // 光伏（规模单位：kW，备案/并网/EPC 报价通行功率口径）
  pv: {
    capexPerWatt: 3.5, // 元/W，工商业分布式初始投资
    performanceRatio: 0.9, // 系统效率 PR（灰尘/线损/逆变器损耗）
    omRatioPerYear: 0.01, // 年运维费占初始投资比例
    lifetimeYears: 25, // 计算期，组件功率质保 25 年
  },
  // 储能（规模单位：kWh，工商业储能柜通行能量口径）；套利收益按分省峰谷价差直接计（provinces.X.peakValleySpread，公开数据项）
  storage: {
    capexPerKWh: 1200, // 元/kWh，即 1.2 元/Wh
    cyclesPerDay: 2, // 两充两放，峰谷套利典型策略
    omRatioPerYear: 0.02,
    lifetimeYears: 10, // 电芯质保 typical 10 年
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
  },
  // 分省参数：年等效利用小时 + 工商业电价 + 峰谷价差（面板按省分条列出）。
  // 覆盖大陆 31 个省级单位（22 省 + 5 自治区 + 4 直辖市），按华北→东北→华东→华中→华南→西南→西北排列；
  // 省内价区差异（如深圳 vs 广东其余、蒙西 vs 蒙东）不建模，取省量级，用户可在公开数据抽屉按项目地微调。
  // peakValleySpread 为真实数据：2026年8月电网代理购电（一般工商业 1-10kV）峰谷价差，
  // 取单一制与两部制标准档较高者、不含 1.5 倍上浮档（省内多价区如广东取珠三角五市档）；
  // 未收录的 6 省按演示假设值兜底——来源见下方 SPREAD_SOURCE / SPREAD_FALLBACK_SOURCE
  provinces: {
    北京: { sunHours: 1200, elecPrice: 0.8, peakValleySpread: 0.7248 },
    天津: { sunHours: 1200, elecPrice: 0.78, peakValleySpread: 0.8378 },
    上海: { sunHours: 1050, elecPrice: 0.85, peakValleySpread: 1.0937 },
    重庆: { sunHours: 850, elecPrice: 0.68, peakValleySpread: 1.0816 },
    河北: { sunHours: 1300, elecPrice: 0.65, peakValleySpread: 0.75 }, // 冀北 0.7175，取南网主体档
    山西: { sunHours: 1350, elecPrice: 0.55, peakValleySpread: 0.4638 },
    内蒙古: { sunHours: 1550, elecPrice: 0.5, peakValleySpread: 0.4676 }, // 蒙东档
    辽宁: { sunHours: 1250, elecPrice: 0.65, peakValleySpread: 0.4352 },
    吉林: { sunHours: 1300, elecPrice: 0.62, peakValleySpread: 0.6 }, // 演示假设值兜底
    黑龙江: { sunHours: 1300, elecPrice: 0.6, peakValleySpread: 0.3071 },
    江苏: { sunHours: 1100, elecPrice: 0.82, peakValleySpread: 0.6476 }, // 100kVA 及以上档
    浙江: { sunHours: 1050, elecPrice: 0.85, peakValleySpread: 0.7849 },
    安徽: { sunHours: 1100, elecPrice: 0.7, peakValleySpread: 0.8167 }, // 两部制档
    福建: { sunHours: 1150, elecPrice: 0.68, peakValleySpread: 0.5379 },
    江西: { sunHours: 1100, elecPrice: 0.7, peakValleySpread: 0.6134 },
    山东: { sunHours: 1250, elecPrice: 0.7, peakValleySpread: 0.846 }, // 四档同值
    河南: { sunHours: 1200, elecPrice: 0.68, peakValleySpread: 0.6 }, // 演示假设值兜底
    湖北: { sunHours: 1050, elecPrice: 0.72, peakValleySpread: 0.5898 },
    湖南: { sunHours: 1000, elecPrice: 0.72, peakValleySpread: 0.6 }, // 演示假设值兜底
    广东: { sunHours: 1050, elecPrice: 0.75, peakValleySpread: 1.2655 }, // 珠三角五市档
    广西: { sunHours: 1100, elecPrice: 0.65, peakValleySpread: 0.3629 },
    海南: { sunHours: 1250, elecPrice: 0.8, peakValleySpread: 0.6 }, // 演示假设值兜底
    四川: { sunHours: 850, elecPrice: 0.65, peakValleySpread: 0.631 }, // 两部制档
    贵州: { sunHours: 950, elecPrice: 0.6, peakValleySpread: 0.7053 }, // 两部制档
    云南: { sunHours: 1400, elecPrice: 0.55, peakValleySpread: 0.6 }, // 演示假设值兜底
    西藏: { sunHours: 1900, elecPrice: 0.55, peakValleySpread: 0.6 }, // 演示假设值兜底
    陕西: { sunHours: 1300, elecPrice: 0.6, peakValleySpread: 0.7315 }, // 两部制档，含/不含榆林同值
    甘肃: { sunHours: 1500, elecPrice: 0.5, peakValleySpread: 0.1461 }, // 全国最低
    青海: { sunHours: 1650, elecPrice: 0.45, peakValleySpread: 0.2818 },
    宁夏: { sunHours: 1550, elecPrice: 0.45, peakValleySpread: 0.1557 },
    新疆: { sunHours: 1500, elecPrice: 0.45, peakValleySpread: 0.2568 },
  },
  // 通用系数
  general: {
    gridEmissionFactor: 0.5366, // tCO₂/MWh，全国电网平均
    discountRate: 0.06, // 财务评价折现率
  },
}

// 分省参数的分组来源说明（各注各的，避免两组共用一条互相夹带无关半句）
const PROVINCE_SUN_SOURCE = '演示假设值：利用小时参考中国气象局太阳能资源区划典型区间'
const PROVINCE_PRICE_SOURCE = '演示假设值：电价参考 2024–2025 各省工商业购电大致水平'

// 分省峰谷价差来源（真实数据，独立公开数据项）：储能头条/国际能源网按月汇总自国网、南网分省公告
const SPREAD_SOURCE =
  '储能头条/国际能源网《2026年8月电网代理购电价格》：一般工商业 1-10kV，取单一制与两部制标准档较高者（不含 1.5 倍上浮档）'
// 该月表未收录的省份 → 演示假设值兜底（红线：不编造数据），后续月度表出数后替换
const SPREAD_MISSING = new Set(['吉林', '河南', '湖南', '海南', '云南', '西藏'])
const SPREAD_FALLBACK_SOURCE =
  '演示假设值：2026年8月代理购电表未收录该省，暂按已收录 25 省中位水平取整 0.60 元/kWh 兜底'

// 年运维比例 / 计算期的统一来源说明
const OM_SOURCE = '演示假设值：年运维费占初始投资比例，按行业运维报价量级'
const LIFE_SOURCE = (years, basis) => `演示假设值：计算期 ${years} 年（${basis}）`

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
    hint: '一般工商业 1-10kV 峰谷价差（2026年8月代理购电），直接决定储能套利收益',
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
        path: 'storage.cyclesPerDay',
        label: '每日充放循环',
        unit: '次/天',
        step: 1,
        source: '行业惯例：两充两放（峰谷套利典型运行策略）',
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
]
