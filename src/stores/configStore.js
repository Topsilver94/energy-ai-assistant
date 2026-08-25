import { create } from 'zustand'
import { defaultConfig } from '../data/coefficients.js'
import { defaultBenchmarks } from '../data/benchmarks.js'

// config = 各类系数 + 建筑基准，合成一个纯数值嵌套对象供全部计算读取
export const buildDefaultConfig = () => ({
  ...defaultConfig,
  benchmarks: { ...defaultBenchmarks },
})

/**
 * 全局配置中心（CLAUDE.md §5 ★核心）
 *
 * 所有计算系数一律不写死在组件里，全部集中于此；
 * 专家参数面板「保存配置」→ updateConfig 整体提交，
 * 依赖系数的结果即时重算（Sprint 2 接入计算后生效）。
 */
export const useConfigStore = create((set) => ({
  config: buildDefaultConfig(),

  // draft 为面板提交的完整配置对象（已数值化），整体替换保证原子性
  updateConfig: (draft) => set({ config: draft }),

  resetConfig: () => set({ config: buildDefaultConfig() }),
}))
