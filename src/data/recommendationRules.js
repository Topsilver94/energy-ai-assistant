/**
 * 方案配置推荐规则（模块② 规则引擎数据源）——确定性阈值与经验参数。
 *
 * 边界说明：这些是「推荐逻辑阈值」而非测算系数——决定打分与建议规模，
 * 不进入财务公式，因此不进 configStore/专家参数面板（面板假设纯数值树，
 * 且调频低）；调整改本文件即可，全部带 source 可溯源（红线：不编造数据）。
 */

export const recommendationRules = {
  roofUsableRatio: {
    values: { 办公: 0.4, 商场: 0.5, 医院: 0.35 },
    source: '演示假设值：屋顶可用面积占建筑面积比例（低层大屋面商场高于高层办公/医院）',
  },
  pvKwPerSqm: {
    values: 0.1,
    source: '演示假设值：屋顶光伏装机密度 0.1 kW/㎡（组件 + 检修通道综合）',
  },
  pvFullScoreMw: {
    values: 2,
    source: '演示假设值：屋顶可装 2 MW 视为满分信号（工商业分布式典型经济规模）',
  },
  pvMinMw: {
    values: 0.2,
    source: '演示假设值：分布式光伏最小示范规模',
  },
  storageStrongSpread: {
    values: 0.7,
    source: '演示假设值：峰谷价差 ≥ 0.7 元/kWh 视为储能两充两放经济边界',
  },
  storageToPvRatio: {
    values: 0.5,
    source: '演示假设值：光储配比 1:0.5（工商业常见区间中值），规模需负荷数据修正',
  },
  storageMinMwh: {
    values: 0.5,
    source: '演示假设值：工商业储能最小经济规模',
  },
  coolingMinArea: {
    values: { 商场: 20000, 医院: 30000, 办公: 50000 },
    source: '演示假设值：区域集中供冷经济规模门槛（㎡），低于则管网摊销偏高',
  },
  chargerPilesPer10kSqm: {
    values: { 商场: 8, 办公: 4, 医院: 4 },
    source: '演示假设值：按建筑类型的充电桩配建水平（桩/万㎡），需车位与流量确认',
  },
  chargerMinPiles: {
    values: 2,
    source: '演示假设值：充电桩最小示范配置',
  },
  levelBuckets: {
    values: { 推荐: 75, 可考虑: 50, 谨慎: 25 },
    source: '展示分桶（分类逻辑，非财务系数）：≥75 推荐 / ≥50 可考虑 / ≥25 谨慎 / 其余暂缓',
  },
}
