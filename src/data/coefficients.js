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
    capexPerWatt: 3.0, // 元/W，工商业分布式初始投资
    performanceRatio: 0.9, // 系统效率 PR（灰尘/线损/逆变器损耗）
    degradationPerYear: 0.0055, // 年发电量线性衰减（首年全额，自第二年起递减；运维恒定）
    omRatioPerYear: 0.01, // 年运维费占初始投资比例
    lifetimeYears: 25, // 计算期，组件功率质保 25 年
  },
  // 储能（规模单位：kWh，工商业储能柜通行能量口径）；套利收益按分省峰谷价差 × 分时循环折算
  //（价差与循环判定均为公开数据项：provinces.X.peakValleySpread / cyclesPerDay，不在全局写死循环次数）
  storage: {
    capexPerKWh: 850, // 元/kWh，即 0.85 元/Wh
    cycle2SpreadRatio: 0.5, // 两充两放省第二循环有效价差占全额峰谷价差比例（平充峰放：峰−平 ≈ 半额）
    roundTripEfficiency: 0.88, // AC-AC 综合效率（充放电双向损耗，套利充电量按 1/η 反推）
    depthOfDischarge: 0.9, // 可用放电深度（额定容量 × DoD = 单次可放电量）
    availableDaysPerYear: 330, // 年有效运行天数（扣检修、限电与极端天气）
    chargePricePerKwh: 0.3, // 充电时段购电价代表值（元/kWh，效率损耗电量计价用）
    degradationPerYear: 0.025, // 年可用放电量线性衰减（首年全额，自第二年起递减；运维恒定）
    demandShaveRatio: 0.1, // 需量削峰系数：最大需量中可被储能削除的比例（行业区间 5%–15% 保守中值）
    demandPricePerKwMonth: 30, // 两部制需量电价代表值（元/kW·月）
    omRatioPerYear: 0.02,
    lifetimeYears: 10, // 电芯质保 typical 10 年
  },
  // 储能定容参考（公开数据组）：模块① 储能规模双口径推导与需量基数推定用，来源见下方 STORAGE_*_SOURCE
  storageSizing: {
    transformerVa: { 办公: 80, 商场: 100, 医院: 80, 酒店: 90, 高校: 40, 数据中心: 1200, 工业厂房: 50 }, // VA/㎡，推定单位面积配变容量
    transformerPowerRatio: 0.25, // 储能功率占变压器容量上限（防倒送与接入口径）
    hours: 2, // h，工商业主流 2 小时系统
    peakShiftRatio: 0.35, // 日均用电量 → 峰段可消纳放电量系数（方案阶段代理）
    demandLoadFactor: { 办公: 0.45, 商场: 0.55, 医院: 0.6, 酒店: 0.55, 高校: 0.4, 数据中心: 0.9, 工业厂房: 0.6 }, // 负荷率（平均负荷÷最大需量），需量基数推定用
  },
  // 电耗预估参考（公开数据组）：模块① 年度电费未知时的兜底预估——
  // 面积口径（典型实际强度 × 面积）与变压器口径（kVA × 功率因数 × 负载率 × 8760h）取短板，
  // 来源见下方 TYPICAL_INTENSITY_SOURCES / LOAD_FACTOR_SOURCE
  loadEstimate: {
    typicalIntensity: { 办公: 115, 商场: 250, 医院: 180, 酒店: 135, 高校: 75, 数据中心: 6600, 工业厂房: 200 }, // kWh/㎡·a，存量调研区间中值（与对标基准表分开维护，防循环论证）
    transformerPowerFactor: 0.9, // 无功补偿后功率因数
    transformerLoadFactor: { 办公: 0.25, 商场: 0.35, 医院: 0.3, 酒店: 0.3, 高校: 0.2, 数据中心: 0.8, 工业厂房: 0.25 }, // 配变平均负载率
  },
  // 集中供冷（规模单位：万㎡；能源站 + 管网新建，冷费收益建模，见 utils/finance.js）
  cooling: {
    capexPerSqm: 300, // 元/㎡，能源站 + 管网 + 用户接入的单位投资
    kwhPerSqm: 50, // kWh/㎡·a，年供冷需求密度（冷量）
    coolingPricePerKwh: 0.75, // 元/kWh，集中供冷冷价（按冷量计费）
    copBaseline: 3.0, // 常规分散制冷平均 COP（碳减排对标基准，兼作分体空调客户侧电费口径）
    cop: 5.0, // 集中供冷高效机房 COP
    splitAcCapexPerSqm: 300, // 分体/多联机自建参考初投资（客户侧对比口径，元/㎡ 供冷面积）
    splitAcOmRatioPerYear: 0.02, // 分体年维保占初投资比（清洗/加氟/维修）
    splitAcLifetimeYears: 10, // 分体整机更换周期（压缩机寿命）
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
    // 配建参考（公开数据组）：桩＝120kW 双枪一体整机（1 桩 2 枪 ≈ 覆盖 2 个充电车位），
    // 与 capexPerPile/dailyKwhPerPile 同口径；2026-08 由枪口径重折为整机台数（原数值实为充电车位/枪数，虚高一倍）
    pilesPer10kSqm: { 商场: 4, 酒店: 2, 办公: 2, 医院: 2, 高校: 2, 工业厂房: 2, 数据中心: 1 }, // 双枪桩台数/万㎡（按全国底线 10% 折算）
    // 分省新建政策档（小数）：仅收录口径清晰的有源省，未收录省与既有建筑走全国底线 10%（规则表）。
    // ── 换版清单（政策复核时照此五步，面板/文案/断言自动联动）：
    //    ① 本表改省值（增删省需同步下方 CHARGER_RATIO_SOURCES 加/删对应来源句）
    //    ② 改 CHARGER_RATIO_AS_OF（见顶部数据日期常量块）
    //    ③ 跑 node 冒烟：buildRecommendations 新建该省（有/无车位两分支）核对桩数
    //    ④ 同步 verify/m2.cjs 场景 I 断言值与 verify/README.md m2 行基准
    //    ⑤ recommend.js / glm.js 不动（分省档只经 config 消费） ──
    policyRatioByProvince: { 北京: 0.25, 重庆: 0.5, 湖南: 0.3, 广东: 0.2, 海南: 0.2, 山东: 0.15 },
  },
  // 屋面光伏参考（公开数据组）：模块① 光伏规模推导用——可用系数按建筑类型，装机密度与折减按屋面形式；
  // 屋面面积实填（图纸投影）时走单项折减链（installRatio × 形式折减），绕开类型复合系数
  roof: {
    // 可用系数＝屋面投影占建筑面积（类型典型形态混合中位）× 屋面内可安装比例（扣障碍物），
    // 2026-08 由乐观端（隐含 1~1.5 层形态）重标至保守端：低层大屋面个例会低估（现场上调），
    // 多高层/塔楼约吻合——塔楼/综合体等形态极端项目建议实填屋面面积——取值依据见下方 ROOF_RATIO_SOURCE
    usableRatio: { 办公: 0.1, 商场: 0.2, 医院: 0.08, 酒店: 0.08, 高校: 0.12, 数据中心: 0.3, 工业厂房: 0.65 },
    installRatio: 0.8, // 实填屋面（图纸投影）→ 可安装面积折减：扣机房/水箱/女儿墙/检修通道
    types: {
      平屋面: { ratioFactor: 1.0, kwPerSqm: 0.1 },
      坡屋面: { ratioFactor: 0.7, kwPerSqm: 0.13 },
      彩钢屋面: { ratioFactor: 1.0, kwPerSqm: 0.12 },
    },
    bipv: { ratioFactor: 0.9, kwPerSqm: 0.14 }, // 新建 BIPV 一体化满铺口径（覆盖率已含设备口预留）
  },
  // 分省参数：年等效利用小时 + 工商业电价 + 峰谷价差（面板按省分条列出）。
  // 覆盖大陆 31 个省级单位（22 省 + 5 自治区 + 4 直辖市），按华北→东北→华东→华中→华南→西南→西北排列；
  // 省内价区差异（如深圳 vs 广东其余、蒙西 vs 蒙东）不建模，取省量级，用户可在公开数据抽屉按项目地微调。
  // peakValleySpread 为真实数据：电网代理购电（一般工商业 1-10kV）峰谷价差，月份见下方 SPREAD_AS_OF 常量，
  // 口径＝标准表内最大时段价差（尖峰或峰 − 谷或深谷，单一制/两部制取较高者），排除 1.5 倍用户类表；
  // 省内多价区如广东取珠三角六市档；图值（汇总图无 1.5 标注）与原公告表读数双路径，
  // 读数经「1.5 倍表值 ≈ 标准值 × 1.5」交叉验证；未收录/未公布分时的省按演示假设值兜底。
  // 2026-09 换版：吉林/河南/海南三省兜底转正；山西/蒙东/北京/上海等省修正 8 月混入 1.5 档的口径偏差
  // cyclesPerDay 为分时结构判定（1=一充一放，2=两充两放；结构性事实而非可调经验系数）：
  // 时段结构支持两充两放的 8 省取 2，其余保守按 1 计——来源见下方 CYCLES_SOURCE，统计窗口见 CYCLES_AS_OF
  provinces: {
    北京: { sunHours: 1200, elecPrice: 0.8, peakValleySpread: 0.5772, cyclesPerDay: 1 }, // 9月无尖峰，单一制标准档（原表读）
    天津: { sunHours: 1200, elecPrice: 0.78, peakValleySpread: 0.823, cyclesPerDay: 2 }, // 两充两放（午间谷段 12:00–14:00 + 峰谷比 4:1）；单一制标准档
    上海: { sunHours: 1050, elecPrice: 0.85, peakValleySpread: 0.9705, cyclesPerDay: 1 }, // 两部制峰−深谷（单一制不分时）
    重庆: { sunHours: 850, elecPrice: 0.68, peakValleySpread: 0.7901, cyclesPerDay: 1 }, // 单一制（9月无尖峰）
    河北: { sunHours: 1300, elecPrice: 0.65, peakValleySpread: 0.7052, cyclesPerDay: 1 }, // 南网两部制尖峰−深谷
    山西: { sunHours: 1350, elecPrice: 0.55, peakValleySpread: 0.3336, cyclesPerDay: 1 }, // 单一制标准档；用户核表修正（低清图 OCR 三读不一，以人工读数为准）
    内蒙古: { sunHours: 1550, elecPrice: 0.5, peakValleySpread: 0.2059, cyclesPerDay: 1 }, // 蒙东档；用户核表修正（OCR 聚类 0.2067–0.2076，末位以人工读数为准）；代理购电价同比降约 38%
    辽宁: { sunHours: 1250, elecPrice: 0.65, peakValleySpread: 0.2967, cyclesPerDay: 1 }, // 代理购电价同比降约 33%
    吉林: { sunHours: 1300, elecPrice: 0.62, peakValleySpread: 0.3792, cyclesPerDay: 1 }, // 9月兜底转正；2026 取消固定分时，保守一充一放
    黑龙江: { sunHours: 1300, elecPrice: 0.6, peakValleySpread: 0.3057, cyclesPerDay: 1 },
    江苏: { sunHours: 1100, elecPrice: 0.82, peakValleySpread: 0.5753, cyclesPerDay: 1 }, // 两部制档；2025-06 新政单峰化，一充一放
    浙江: { sunHours: 1050, elecPrice: 0.85, peakValleySpread: 0.6893, cyclesPerDay: 2 }, // 两充两放；单一制=两部制同值，价差收窄 12%（浙 112 号文新政）
    安徽: { sunHours: 1100, elecPrice: 0.7, peakValleySpread: 0.7116, cyclesPerDay: 1 }, // 单一制峰−深谷
    福建: { sunHours: 1150, elecPrice: 0.68, peakValleySpread: 0.5341, cyclesPerDay: 1 },
    江西: { sunHours: 1100, elecPrice: 0.7, peakValleySpread: 0.5709, cyclesPerDay: 2 }, // 两充两放
    山东: { sunHours: 1250, elecPrice: 0.7, peakValleySpread: 0.9018, cyclesPerDay: 1 }, // 四类同值；深谷段结构未获名单确认，保守按一充一放
    河南: { sunHours: 1200, elecPrice: 0.68, peakValleySpread: 0.7465, cyclesPerDay: 1 }, // 9月兜底转正（单一制）
    湖北: { sunHours: 1050, elecPrice: 0.72, peakValleySpread: 0.4979, cyclesPerDay: 1 }, // 2026 取消固定分时，代理购电口径待核，保守一充一放
    湖南: { sunHours: 1000, elecPrice: 0.72, peakValleySpread: 0.6, cyclesPerDay: 2 }, // 兜底维持：9月表未公布标准档分时电价（仅平段）；两充两放
    广东: { sunHours: 1050, elecPrice: 0.75, peakValleySpread: 1.3529, cyclesPerDay: 2 }, // 珠三角六市单一制（含迎峰度夏尖峰）；两充两放；全国最大
    广西: { sunHours: 1100, elecPrice: 0.65, peakValleySpread: 0.4224, cyclesPerDay: 1 }, // 单一制尖峰−谷
    海南: { sunHours: 1250, elecPrice: 0.8, peakValleySpread: 0.5657, cyclesPerDay: 1 }, // 9月兜底转正
    四川: { sunHours: 850, elecPrice: 0.65, peakValleySpread: 0.6634, cyclesPerDay: 1 }, // 单一制峰−谷
    贵州: { sunHours: 950, elecPrice: 0.6, peakValleySpread: 0.4982, cyclesPerDay: 1 }, // 两部制（单一制不分时）；二充窗口仅 1h，保守一充一放
    云南: { sunHours: 1400, elecPrice: 0.55, peakValleySpread: 0.6, cyclesPerDay: 1 }, // 演示假设值兜底
    西藏: { sunHours: 1900, elecPrice: 0.55, peakValleySpread: 0.6, cyclesPerDay: 1 }, // 演示假设值兜底
    陕西: { sunHours: 1300, elecPrice: 0.6, peakValleySpread: 0.753, cyclesPerDay: 1 }, // 两部制档，含/不含榆林同值
    甘肃: { sunHours: 1500, elecPrice: 0.5, peakValleySpread: 0.154, cyclesPerDay: 1 }, // 全国最低
    青海: { sunHours: 1650, elecPrice: 0.45, peakValleySpread: 0.2922, cyclesPerDay: 1 },
    宁夏: { sunHours: 1550, elecPrice: 0.45, peakValleySpread: 0.1557, cyclesPerDay: 1 },
    新疆: { sunHours: 1500, elecPrice: 0.45, peakValleySpread: 0.182, cyclesPerDay: 1 }, // 用户核表 + 交叉验证闭环（图 1.5 倍类 0.2730 ÷ 1.5 = 0.182）；代理购电价同比降 51.6%（全国最大降幅）
  },
  // 通用系数
  general: {
    gridEmissionFactor: 0.5306, // tCO₂/MWh，全国电网平均（2023 年，公告2025年第47号）
    discountRate: 0.06, // 财务评价折现率
  },
}

// ── 数据日期常量（年更编辑点：峰谷价差换月只改 SPREAD_AS_OF、分省电价换年只改 ELECP_AS_OF、
//    系统造价换版只改 CAPEX_AS_OF 与 pv.capexPerWatt / storage.capexPerKWh 两值（季度复核，
//    联动改锚点 PINS 与 m1 基线，对照记录在 verify/external-anchors.md）、
//    分时结构名单换版只改 CYCLES_AS_OF、充电桩配建档换版只改 CHARGER_RATIO_AS_OF 与
//    charger.policyRatioByProvince 表值（增删省同步 CHARGER_RATIO_SOURCES），
//    所有来源句与界面提示自动收敛，不再散落多处手改） ──
export const SPREAD_AS_OF = '2026年9月' // 峰谷价差：电网代理购电月度表所属月份
export const ELECP_AS_OF = '2024–2025' // 分省电价：工商业购电水平大致区间
export const CAPEX_AS_OF = '2026年9月' // 光伏/储能单位造价：外部锚定复核日期（建议季度）
export const CYCLES_AS_OF = '2026年9月' // 分时结构：分省两充两放名单所属复核窗口（建议按季度复核名单）
export const CHARGER_RATIO_AS_OF = '2026年9月' // 充电桩分省配建政策档：口径复核日期

// 分省参数的分组来源说明（各注各的，避免两组共用一条互相夹带无关半句）
// 分省电价挂真实公示表（取整代表值、不标演示假设值）；利用小时标准只给辐照分级、
// 小时数为可研惯例折算（保留演示假设值定性）——两组定性不同是刻意为之，不互相夹带
const PROVINCE_SUN_SOURCE =
  '分省利用小时为工程常用取值（演示假设值）：资源量级锚定 GB/T 31155-2014《太阳能资源等级 总辐射》（按年总辐照量划分资源等级，中国气象局归口），按等级折算利用小时为工商业分布式可研惯例；具体项目以场址日照数据核算'
const PROVINCE_PRICE_SOURCE = `分省电价参考 ${ELECP_AS_OF} 电网企业代理购电价格公示（国网/南网分省按月发布，与峰谷价差同源），按年度水平取量级代表值；售电市场化后工商业实际电价随月浮动，具体项目以当月电价文件为准`

// 分省峰谷价差来源（真实数据，独立公开数据项）：储能头条/国际能源网按月汇总自国网、南网分省公告
const SPREAD_SOURCE = `储能头条/国际能源网《${SPREAD_AS_OF}电网代理购电价格》：一般工商业 1-10kV，取标准表内最大时段价差（尖峰或峰 − 谷或深谷，单一制与两部制较高者），不含 1.5 倍用户类表；汇总图无 1.5 标注的省直取图值，标注省回原公告表读标准档（「1.5 倍表值 ≈ 标准值 × 1.5」交叉验证 + 关键省人工核表复核）`
// 该月表未收录/未公布分时的省份 → 演示假设值兜底（红线：不编造数据），后续月度表出数后替换
const SPREAD_MISSING = new Set(['湖南', '云南', '西藏'])
const SPREAD_FALLBACK_SOURCE = `演示假设值：${SPREAD_AS_OF}代理购电表未收录（云南/西藏）或未公布标准档分时电价（湖南，当月表仅平段），暂按已收录省中位量级取整 0.60 元/kWh 兜底`

// 分时循环判定来源（真实数据，独立公开数据项）：按分时时段窗口逐省判定，非价差水平的推论。
// 2026-09 换版：江苏单峰化退出，湖北/吉林随「9 地取消固定分时」保守降级，名单 8 → 5 省
const CYCLES_SOURCE = `${CYCLES_AS_OF}复核口径（CNESA/储能头条分时盘点 + 各省发改委文件交叉核）：时段结构支持两充两放的 5 省（浙江/广东/湖南/江西/天津）取 2——天津午间谷段 12:00–14:00 且峰谷比 4:1、广东午间新增谷段、浙江午谷延长+晚峰后移，两充两放结构仍在；江苏 2025-06 新政后仅剩单一高峰段，降为一充一放；湖北、吉林已发文取消固定分时电价（全国 9 地：贵州/河北南网/湖北/陕西/吉林/云南/重庆/辽宁/河南，国家能源局 2026-02 转载第一财经梳理），代理购电用户分时结构待省内核实，保守按一充一放计；贵州二充窗口仅 1 小时、山东深谷段结构未获名单确认，均计 1。口径适用于电网代理购电用户——2026-03 起《电力中长期市场基本规则》市场化交易用户不再执行固定分时电价；各省分时时段年内仍会调整，决策前需核当月文件`

// 年运维比例 / 计算期的统一来源说明
const OM_SOURCE = '演示假设值：年运维费占初始投资比例，按行业运维报价量级'
const LIFE_SOURCE = (years, basis) => `演示假设值：计算期 ${years} 年（${basis}）`

// ── 经验参考表（公开数据组）：屋面 / 供冷折算 / 充电桩配建——查表经验值，模块① 推荐引擎读取 ──
const refField = (path, label, unit, step, source) => ({ path, label, unit, step, source })
const ROOF_RATIO_SOURCE =
  '复合系数（演示假设值）＝屋面投影占建筑面积比例（按该类型典型层数与形态取混合中位：厂房单层大屋面，办公医院酒店按多层/高层混合形态）× 屋面内可安装比例（扣机房/水箱/女儿墙/检修通道；政策侧量级印证：整县试点“5432”要求公共建筑屋顶可安装比例不低于 40%，系申报目标口径）；取保守端——低层大屋面个例会低估（现场上调），塔楼/多高层约吻合，需实际屋面核对修正'
const ROOF_TYPE_SOURCE =
  '屋面形式对可用折减与装机密度的影响，工程惯例区间（演示假设值）：彩钢夹具直贴密度最高，坡屋面顺坡满铺但仅计有效朝向坡面（折减 0.7），平屋面支架阵列需留倾角间距与检修通道——布置要求依据 GB/T 51368-2019《建筑光伏系统应用技术标准》（阴影遮挡分析、组件布置与构造），密度随纬度北移趋低；需屋面净面积与荷载复核'
const ROOF_INSTALL_SOURCE =
  '演示假设值：实填屋面（图纸投影面积）→ 可安装面积的单项折减，扣机房/水箱/女儿墙/检修通道，工程惯例 0.7–0.9 取 0.8（与复合可用系数内部的扣减口径一致）；实填换算链 = 图纸屋面 × 本折减 × 屋面形式折减（坡屋面朝向另乘），新建 BIPV 覆盖率已含设备口预留不另乘'
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
const CHARGER_PILES_SOURCE =
  '配建底线为公开政策：大型公共建筑物充电设施或预留条件车位比例不低于 10%（国办发〔2015〕73 号《关于加快电动汽车充电基础设施建设的指导意见》及住建部相关通知），北京等地方标准已达 25%~40%；折算链＝典型车位密度 × 配建比例 → 充电车位数（1 车位配 1 枪）→ ÷2（桩＝120kW 双枪一体整机，1 桩 2 枪）→ 桩/万㎡，如商场 0.8~1.2 位/100㎡ × 10% ≈ 8~12 车位 → 4~6 台、取保守端 4，其余类型同法取值；仍为演示假设值，需车位与流量确认'
// 分省新建政策档来源（逐省注口径；未收录省走全国底线 10%，不硬编码放大）。
// 换版线索：表值在 defaultConfig.charger.policyRatioByProvince（含五步换版清单注释），
// 口径日期 CHARGER_RATIO_AS_OF 在顶部「数据日期常量」块——增删省时本表与表值同步改
const CHARGER_RATIO_SOURCES = {
  北京:
    '北京市《电动汽车充电基础设施规划设计标准》（2025 修订）：行政办公、学校、医院类新建项目直接建设充电车位配建 25%（商务商业类更高，新建商品房 40%）',
  重庆:
    '重庆市电动汽车充电设施行动方案：新建办公类公共建筑停车场 100% 具备安装条件、建成比例不低于 50%（办公类口径，其他建筑类型按当地标准核实）',
  湖南:
    '湖南省实施意见：新建大型公共建筑物停车场及社会公共停车场按不低于 30% 建设充电设施（高速服务区同档）',
  广东:
    '广东省规定：新建公共建筑类项目（城市公共停车场/办公楼/商场/酒店）广州、深圳不低于 30%、珠三角其他城市不低于 20%、粤东西北不低于 10%——省档取 20%（珠三角主体口径）',
  海南:
    '《海南省电动汽车充电基础设施建设运营暂行管理办法》：公共建筑按配建停车位的 20% 建设充电设施（新建住宅小区 100% 建设或预留）',
  山东:
    '山东省要求：新建公共配建停车场按不低于 15% 车位比例建设充电设施（其中快充车位不低于 10%）',
}
const COOLING_TCO_SOURCE =
  '演示假设值：客户侧自建分体空调参考——分体/多联机混合初投资 250–350 元/㎡ 取 300（含安装），年维保占初投资 2%（清洗/加氟/维修），整机更换周期 10 年（压缩机寿命）；电费按 供冷密度 ÷ 分散 COP（copBaseline）× 分省电价。客户侧对比不构成报价承诺，需按项目冷负荷设计与当地人工费核定'
const TRANSFORMER_VA_SOURCE =
  '单位面积配变容量指标（VA/㎡）：民用建筑参考《全国民用建筑工程设计技术措施—电气》惯例区间取中值（办公 60~100、商场 80~120、酒店 80~100）；医院/高校/数据中心/工业厂房区间宽，取综合中值为演示假设值；实填报装容量后以实值为准'
const STORAGE_SIZING_SOURCE =
  '储能功率上限 25% 借自用户侧分布式电源接入口径：国家电网 Q/GDW 1480《分布式电源接入电网技术规定》与国家能源局 2021 年答复（分布式电源总容量不宜超上级变压器供电区域最大负荷 25%），行业另按充电功率 ≤ 变压器容量 80% 校核过载，项目按 25% 保守定容防倒送；2h 为工商业主流配置；峰段可转移系数 0.35 为演示假设值（日均用电量 → 峰段可消纳放电量的方案阶段代理），需负荷曲线核定'
const STORAGE_ENGINEERING_SOURCE =
  '演示假设值（行业通行工程量级）：AC-AC 综合效率取 0.88（含 PCS 与变压器双向损耗，通行 85%–90%）；磷酸铁锂柜可用放电深度取 0.9；年有效运行约 330 天（扣检修、限电与极端天气）；充电损耗电量按充电时段购电价计价，取全国一般工商业谷段 0.2–0.4 元/kWh 中值 0.3'
const DEGRADATION_PV_SOURCE =
  '质保口径（真实数据项）：晶硅组件线性质保通行条款——首年后年衰减 ≤0.55%、25 年末功率 ≥84.8%（主流厂商公开质保书），取 0.55%/年线性；质保为最差情形承诺，实际衰减多温和于上界。首年全额、自第二年起递减，运维恒定（2026-09 口径轮引入，依据 verify/case-replay.md C4 归因：无衰减口径较第三方研报基准偏乐观约 5pp）'
const DEGRADATION_STORAGE_SOURCE =
  '质保口径（真实数据项）：磷酸铁锂电芯质保通行条款——10 年 SOH ≥70%–80%（主流厂商公开质保），线性化 2%–3%/年取中 2.5%；衰减作用于年放电量与套利收益，运维恒定（同上：C4 归因引入）'
const DEMAND_SOURCE =
  '演示假设值：两部制需量电价代表值 30 元/kW·月——量级锚定第四监管周期输配电价体系分省两部制需量电价（北京档 28–33 元/kW·月，发改价格〔2026〕1077 号体系 2026-08 起），分省细化留待逐省收录；削峰系数 10% 为行业区间 5%–15% 保守中值（有 30MWh 项目实测削峰潜力仅约 2% 的反例，需负荷曲线核定）；适用前提为两部制按需量计费用户——变压器 ≥315 kVA 强制两部制（100–315 kVA 可选档保守不计），月每 kVA 用电量 ≥260 kWh 时需量电价按 90% 执行（多省明文，确定性计入）'
const DEMAND_LF_SOURCE =
  '演示假设值：分类型负荷率（平均负荷 ÷ 最大需量）——量级锚定 GB 51348-2019《民用建筑电气设计标准》需要系数法与供配电设计手册区间中值（数据中心负荷平稳取 0.9，办公峰谷分明取 0.45）；用于需量基数推定（年电量 ÷ 8760 ÷ 负荷率 与 变压器口径 平均负载率 ÷ 负荷率 双口径取短板），需负荷曲线核定'

// 典型实际强度分类型来源：存量调研区间中值落点（隐含潜力约 7%~13%，行业「既有公共建筑
// 平均节能潜力 10%~20%」叙事的保守下沿——有吸引力又兑现得了）；与对标基准表分开成表，
// 避免用基准推实际、再拿推出来的数对标基准的循环论证
const TYPICAL_INTENSITY_SOURCES = {
  办公: '量级锚定中国建筑节能协会《中国建筑能耗与碳排放研究报告》：存量办公电耗调研区间 70–150 kWh/㎡·a，取中偏上 115（客群老旧建筑占比高），落点为演示假设值',
  商场: '量级锚定中国建筑节能协会《中国建筑能耗与碳排放研究报告》：存量商场电耗调研区间 150–300 kWh/㎡·a，取中值 250，落点为演示假设值',
  医院: '量级锚定中国建筑节能协会《中国建筑能耗与碳排放研究报告》：存量医院电耗调研区间 120–220 kWh/㎡·a，取中值 180（24h 运行 + 设备密度高），落点为演示假设值',
  酒店: '量级锚定中国建筑节能协会《中国建筑能耗与碳排放研究报告》：存量酒店电耗调研区间 90–160 kWh/㎡·a，取中值 135，落点为演示假设值',
  高校: '量级锚定中国建筑节能协会《中国建筑能耗与碳排放研究报告》：高校电耗调研区间 40–90 kWh/㎡·a，取 75（寒暑假低负荷拉低全年均值，潜力天然小），落点为演示假设值',
  数据中心: '演示假设值：按上架率与 PUE 波动取 6600（约基准 ×1.1）；此类客户电费为核心成本，几乎不会走兜底路径',
  工业厂房: '演示假设值：工艺负载主导、行业跨度极大，200 仅量级粗估，需按工艺能耗核定',
}
const LOAD_FACTOR_SOURCE =
  '量级锚点：GB 51348-2019《民用建筑电气设计标准》负载率上限 85%（设计上限口径）；分类型长期平均负载率为演示假设值，建筑电气行业对民用建筑配变长期轻载（平均负载率约 20%~40%）有共识调研（IBE《建筑中变压器的负载率究竟应该是多少》）；变压器口径年电量 = kVA × 功率因数 × 负载率 × 8760h'

// 分省参数面板区（scope: power —— 电力市场数据抽屉）：按「利用小时 / 电价 / 峰谷价差 / 分时结构」拆组，
// 组内字段标签只留省名；indexed: true 标记组内为省名字段 → 面板按拼音首字母分组渲染并挂右缘索引条；
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
    scope: 'power',
    title: '分省年等效利用小时',
    hint: '各省太阳能资源差异，直接影响光伏发电量测算；资源等级为地理固有属性，取值基本不需更新',
    indexed: true,
    fields: Object.keys(defaultConfig.provinces).map((prov) =>
      provinceField(prov, 'sunHours', 'h', 10, PROVINCE_SUN_SOURCE),
    ),
  },
  {
    scope: 'power',
    title: '分省工商业电价',
    hint: '各省工商业购电价格，影响发电收益 / 购电成本测算；按年校准量级代表值（实际月度电价随代理购电表浮动）',
    indexed: true,
    fields: Object.keys(defaultConfig.provinces).map((prov) =>
      provinceField(prov, 'elecPrice', '元/kWh', 0.01, PROVINCE_PRICE_SOURCE),
    ),
  },
  {
    scope: 'power',
    title: '分省峰谷价差',
    hint: `一般工商业 1-10kV 峰谷价差（${SPREAD_AS_OF}代理购电），直接决定储能套利收益；按月更新——代理购电价格表每月公示，换月只改 coefficients.js 的 SPREAD_AS_OF 与各省数值`,
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
    scope: 'power',
    title: '分省分时结构',
    hint: `一般工商业分时电价时段结构判定：2 = 支持两充两放（第二循环按折价计入收益），1 = 按一充一放；按季度复核名单——时段结构随各省发改通知调整，口径截至 ${CYCLES_AS_OF}`,
    indexed: true,
    fields: Object.keys(defaultConfig.provinces).map((prov) =>
      provinceField(prov, 'cyclesPerDay', '次/天', 1, CYCLES_SOURCE),
    ),
  },
]

// 专家参数面板的完整分组契约（benchmarks 分组在 data/benchmarks.js 中定义后并入）。
// scope 决定抽屉归属：expert = 专家参数（系统可调系数与财务假设）；
// power = 电力市场数据（分省动态公开数据，随月度/季度换版）；reference = 工程估算参考（按建筑类型查表，方案阶段估算）
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
        source: `${CAPEX_AS_OF} 外部锚定（对照记录 verify/external-anchors.md）：大 EPC 分布式均价 2.55 元/W（光伏头条周报）+ 2026 年工商业实例带 2.5–3.6 元/W，工商业屋顶复杂度高于大 EPC 均价留余量取 3.0`,
      },
      {
        path: 'pv.performanceRatio',
        label: '系统效率 PR（小数）',
        unit: '',
        step: 0.01,
        source: '演示假设值：含灰尘、线损、逆变器损耗的综合系统效率',
      },
      {
        path: 'pv.degradationPerYear',
        label: '年发电量衰减（小数/年）',
        unit: '',
        step: 0.001,
        source: DEGRADATION_PV_SOURCE,
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
        source: `${CAPEX_AS_OF} 外部锚定（对照记录 verify/external-anchors.md）：2025 H1 工商业储能柜中标加权均价 809.7 元/kWh（CESA 统计，入围带 550–1,333），加安装配套与 2026 年反弹余量取 850（0.85 元/Wh）`,
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
        path: 'storage.roundTripEfficiency',
        label: 'AC-AC 综合效率（小数）',
        unit: '',
        step: 0.01,
        source: STORAGE_ENGINEERING_SOURCE,
      },
      {
        path: 'storage.depthOfDischarge',
        label: '放电深度 DoD（小数）',
        unit: '',
        step: 0.01,
        source: STORAGE_ENGINEERING_SOURCE,
      },
      {
        path: 'storage.availableDaysPerYear',
        label: '年可用天数',
        unit: '天',
        step: 5,
        source: STORAGE_ENGINEERING_SOURCE,
      },
      {
        path: 'storage.chargePricePerKwh',
        label: '充电时段购电价',
        unit: '元/kWh',
        step: 0.05,
        source: STORAGE_ENGINEERING_SOURCE,
      },
      {
        path: 'storage.degradationPerYear',
        label: '年放电量衰减（小数/年）',
        unit: '',
        step: 0.0025,
        source: DEGRADATION_STORAGE_SOURCE,
      },
      {
        path: 'storage.demandShaveRatio',
        label: '需量削峰系数（小数）',
        unit: '',
        step: 0.01,
        source: DEMAND_SOURCE,
      },
      {
        path: 'storage.demandPricePerKwMonth',
        label: '需量电价代表值',
        unit: '元/kW·月',
        step: 1,
        source: DEMAND_SOURCE,
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
        path: 'cooling.splitAcCapexPerSqm',
        label: '分体自建·初投资（客户侧）',
        unit: '元/㎡',
        step: 10,
        source: COOLING_TCO_SOURCE,
      },
      {
        path: 'cooling.splitAcOmRatioPerYear',
        label: '分体·年维保比例（小数）',
        unit: '',
        step: 0.005,
        source: COOLING_TCO_SOURCE,
      },
      {
        path: 'cooling.splitAcLifetimeYears',
        label: '分体·更换周期',
        unit: '年',
        step: 1,
        source: COOLING_TCO_SOURCE,
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
    hint: '按桩数建模（桩＝120kW 直流双枪一体整机，单桩日均为双枪合计口径）：年充电量 = 桩数 × 单桩日均 × 365；净收益 = 充电量 × 服务费 ×(1−抽成) − 场地成本 − 运维',
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
  {
    scope: 'expert',
    title: '通用财务',
    hint: '折现率 = IRR 合格线（敏感性「跌破折现率」判定基准，不改 IRR 数值本身）；资金成本或企业内部基准收益率不同时调整——自有资金约 6%，融资成本上浮或合同能源管理投资方常要求 10% 以上',
    fields: [
      {
        path: 'general.discountRate',
        label: '折现率（小数）',
        unit: '',
        step: 0.005,
        source: '演示假设值：能源项目财务评价常用基准折现率 6%',
      },
    ],
  },
  ...provinceSections,
  {
    scope: 'power',
    title: '通用系数',
    hint: '电网口径的全国通用电力数据（碳减排换算用）；排放因子按生态环境部年度公告更新',
    fields: [
      {
        path: 'general.gridEmissionFactor',
        label: '电网排放因子',
        unit: 'tCO₂/MWh',
        step: 0.0001,
        source:
          '生态环境部、国家统计局《关于发布2023年电力二氧化碳排放因子的公告》（公告2025年第47号，2025-12-31）全国电力平均因子 0.5306 kgCO₂/kWh；注意与电力碳足迹因子（LCA 口径）不可混用',
      },
    ],
  },
  {
    scope: 'reference',
    title: '屋面光伏参考',
    hint: '屋面可用系数按建筑类型，装机密度与可用折减按屋面形式；模块① 光伏规模推导用',
    fields: [
      ...benchmarkTypes.map((t) =>
        refField(`roof.usableRatio.${t.key}`, `${t.label}可用系数`, '', 0.05, ROOF_RATIO_SOURCE),
      ),
      refField('roof.installRatio', '实填·障碍检修折减', '', 0.05, ROOF_INSTALL_SOURCE),
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
    scope: 'reference',
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
    scope: 'reference',
    title: '充电桩配建参考',
    hint: `按建筑类型的双枪一体桩配建台数（台/万㎡，按全国底线 10% 折算）与分省新建政策档（新建读省档线性放大，未收录省与既有建筑走全国底线 10%）；政策口径截至 ${CHARGER_RATIO_AS_OF}，地方标准可上调`,
    fields: [
      ...benchmarkTypes.map((t) =>
        refField(`charger.pilesPer10kSqm.${t.key}`, `${t.label}配建`, '台/万㎡', 1, CHARGER_PILES_SOURCE),
      ),
      ...Object.keys(defaultConfig.charger.policyRatioByProvince).map((prov) =>
        refField(
          `charger.policyRatioByProvince.${prov}`,
          `${prov}新建政策档（小数）`,
          '',
          0.05,
          CHARGER_RATIO_SOURCES[prov],
        ),
      ),
    ],
  },
  {
    scope: 'reference',
    title: '储能定容与需量参考',
    hint: '模块① 储能规模双口径推导（变压器口径 × 功率占比上限 × 系统小时数 与 负荷口径 日均用电量 × 峰段可转移系数 取短板）与需量基数推定（负荷率法 × 变压器法取短板，模块② 需量收益用）；均为方案阶段估算法',
    fields: [
      ...benchmarkTypes.map((t) =>
        refField(`storageSizing.transformerVa.${t.key}`, `${t.label}配变指标`, 'VA/㎡', 10, TRANSFORMER_VA_SOURCE),
      ),
      refField('storageSizing.transformerPowerRatio', '功率占比上限', '', 0.05, STORAGE_SIZING_SOURCE),
      refField('storageSizing.hours', '系统小时数', 'h', 0.5, STORAGE_SIZING_SOURCE),
      refField('storageSizing.peakShiftRatio', '峰段可转移系数', '', 0.05, STORAGE_SIZING_SOURCE),
      ...benchmarkTypes.map((t) =>
        refField(`storageSizing.demandLoadFactor.${t.key}`, `${t.label}负荷率`, '', 0.05, DEMAND_LF_SOURCE),
      ),
    ],
  },
  {
    scope: 'reference',
    title: '电耗预估参考',
    hint: '模块① 年度电费未知时的兜底预估：面积 × 典型实际强度 与 变压器 × 功率因数 × 负载率 × 8760h 双口径取短板；均为方案阶段量级预估，补电费单后回填即转实测对标',
    fields: [
      ...benchmarkTypes.map((t) =>
        refField(
          `loadEstimate.typicalIntensity.${t.key}`,
          `${t.label}典型强度`,
          'kWh/㎡·a',
          5,
          TYPICAL_INTENSITY_SOURCES[t.key],
        ),
      ),
      refField('loadEstimate.transformerPowerFactor', '功率因数', '', 0.05, LOAD_FACTOR_SOURCE),
      ...benchmarkTypes.map((t) =>
        refField(`loadEstimate.transformerLoadFactor.${t.key}`, `${t.label}负载率`, '', 0.05, LOAD_FACTOR_SOURCE),
      ),
    ],
  },
]
