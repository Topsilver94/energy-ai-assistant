import { create } from 'zustand'
import { benchmarkTypes } from '../data/benchmarks.js'

// 模块① 建筑类型枚举：与 config.benchmarks 键一一对应
export const BUILDING_TYPES = benchmarkTypes.map((t) => t.key)

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
    annualElectricityFee: '', // 既有建筑用
    designIntensity: '', // 新建建筑用：设计能耗强度 kWh/㎡·a，留空 = 按约束值预估
    province: '广东',
  },
  diagnosis: null,
  isDiagnosisDone: false,

  setInput: (patch) => set((s) => ({ inputs: { ...s.inputs, ...patch } })),
  setDiagnosis: (result) => set({ diagnosis: result, isDiagnosisDone: true }),
  reset: () => set({ diagnosis: null, isDiagnosisDone: false }),
}))
