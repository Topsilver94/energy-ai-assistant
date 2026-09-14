import { create } from 'zustand'

/**
 * 模块① 挖掘痛点（能耗诊断）
 * 建筑性质分流：
 *   既有建筑：年电费 → 反推年用电量 → 对标基准 → 节能潜力%
 *   新建建筑：无实际电费 → 设计校核（设计强度 vs 约束值）+ 预估能耗，不输出节能潜力
 *
 * diagnosis: calculateDiagnosis 返回值 | null（结构见 utils/diagnosis.js）
 */
export const useDiagnosisStore = create((set) => ({
  // province 用于读取分省电价（config 无全局电价，见 data/coefficients.js）
  inputs: {
    buildingNature: 'existing', // 'existing' 既有 | 'new' 新建
    buildingType: '办公',
    area: '',
    year: 2010, // 既有建筑用（滑杆）
    annualElectricityFee: '', // 既有建筑用（留空 = 按电耗预估参考兜底，结果挂「预估」标注）
    feePeriod: 'annual', // 电费口径：'annual' 按年 | 'monthly' 按月（×12 折年）
    designIntensity: '', // 新建建筑用：设计能耗强度 kWh/㎡·a，留空 = 按约束值预估
    roofType: '', // 既有建筑用：屋面类型（空 = 按建筑类型典型值，影响光伏规模推导）
    transformerKva: '', // 既有建筑用：变压器容量 kVA（选填，空 = 按分类型配变指标推定，影响储能定容）
    loadCurve: null, // 既有建筑用：负荷曲线解析结果（parseLoadCurve stats；选填，有曲线时年电量
    // 走实测口径、电费反推让位，储能定容/需量推定改用实测最大需量——utils/loadCurve.js）
    roofArea: '', // 两种性质共用：屋面面积 ㎡（选填，图纸投影口径；空 = 按面积 × 类型复合系数推定。
    // 塔楼/综合体等形态极端项目类型系数失真大，有图纸实填优先）
    parkingSpots: '', // 两种性质共用：车位数量（选填，空 = 按类型配建水平推定，实填后充电桩规模转实证口径）
    province: '广东',
  },
  diagnosis: null,
  isDiagnosisDone: false,

  setInput: (patch) => set((s) => ({ inputs: { ...s.inputs, ...patch } })),
  setDiagnosis: (result) => set({ diagnosis: result, isDiagnosisDone: true }),
  reset: () => set({ diagnosis: null, isDiagnosisDone: false }),
}))
