/**
 * 建筑能耗基准（模块① 对标用）——单位 kWh/(㎡·a)
 *
 * benchmarkTypes 是唯一事实源：面板渲染、默认 config 组装都从它派生，
 * 避免标签 / 数值 / 来源三处维护。约束值量级参考 GB/T 51161-2016
 * 《民用建筑能耗标准》，具体数值为演示中值（红线：来源如实标注）。
 */

// 三类基准同源：统一一条来源（建筑类型差异已在字段标签体现），
// 面板检测到组内一致时会收编为组级展示
const BENCHMARK_SOURCE =
  '演示假设值：参考 GB/T 51161-2016《民用建筑能耗标准》约束值量级取整'

export const benchmarkTypes = [
  { key: '办公', label: '办公建筑', limit: 90, source: BENCHMARK_SOURCE },
  { key: '商场', label: '商场建筑', limit: 220, source: BENCHMARK_SOURCE },
  { key: '医院', label: '医院建筑', limit: 160, source: BENCHMARK_SOURCE },
]

// 纯数值形态：并入 configStore.config.benchmarks，供对标公式直接读取
export const defaultBenchmarks = Object.fromEntries(
  benchmarkTypes.map((t) => [t.key, t.limit]),
)

// 专家参数面板的建筑基准分组（与 coefficients.js 的 coefficientSections 同构）
// scope: public —— 归入「公开平台数据参考」页签
export const benchmarkSection = {
  scope: 'public',
  title: '建筑能耗基准',
  hint: '单位 kWh/(㎡·a)，模块① 对标用',
  fields: benchmarkTypes.map((t) => ({
    path: `benchmarks.${t.key}`,
    label: `${t.label}基准`,
    unit: 'kWh/㎡·a',
    step: 5,
    source: t.source,
  })),
}
