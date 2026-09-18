import { create } from 'zustand'

// 模块② 系统类型枚举：与 config 系数分组一一对应（组合四项，多选）；
// scaleUnit 用于各系统规模输入框的动态单位标签与占位提示
export const PROJECT_TYPES = [
  { key: 'pv', label: '分布式光伏', scaleUnit: 'kW', placeholder: '如 2000' },
  { key: 'storage', label: '储能', scaleUnit: 'kWh', placeholder: '如 1000' },
  { key: 'cooling', label: '集中供冷', scaleUnit: '万㎡', placeholder: '如 3' },
  { key: 'charger', label: '充电桩', scaleUnit: '桩', placeholder: '如 10' },
]

/**
 * 模块② 锁定收益（可行性速算 · 组合测算）
 *
 * inputs.systems 为各系统的开关 + 规模；省份共用一个（电价/利用小时同源）。
 * feasibility: { province, items: [...分项], total: {...组合总账} } | null，
 * 结构见 utils/finance.js calculateFeasibility 返回值。
 */
export const useProjectStore = create((set) => ({
  inputs: {
    province: '广东',
    // 模块① 采纳推荐时随快照带入的需量推定（{ baseKw, kva, annualKwh }）：模块② 储能需量
    // 收益与报告注记用；null/缺省 = 无诊断数据（② 独立测算路径，储能不计需量收益并如实注明）
    demand: null,
    systems: {
      pv: { enabled: true, capacity: '' }, // 默认选中光伏，首屏即可测算
      storage: { enabled: false, capacity: '' },
      cooling: { enabled: false, capacity: '' },
      charger: { enabled: false, capacity: '' },
    },
  },
  feasibility: null,
  isFeasibleDone: false,

  setInput: (patch) => set((s) => ({ inputs: { ...s.inputs, ...patch } })),
  // 单系统补丁（开关 / 规模），保持 systems 不可变更新
  setSystem: (key, patch) =>
    set((s) => ({
      inputs: {
        ...s.inputs,
        systems: { ...s.inputs.systems, [key]: { ...s.inputs.systems[key], ...patch } },
      },
    })),
  toggleSystem: (key) =>
    set((s) => ({
      inputs: {
        ...s.inputs,
        systems: {
          ...s.inputs.systems,
          [key]: { ...s.inputs.systems[key], enabled: !s.inputs.systems[key].enabled },
        },
      },
    })),
  setFeasibility: (result) => set({ feasibility: result, isFeasibleDone: true }),
  // 一键采纳模块① 推荐组合：仅启用 level 为「推荐/可考虑」的系统并填入建议规模，
  // 谨慎项关闭；未采纳项保留原规模。覆盖语义——UI 侧已做两段式确认。
  // 省份随采纳一并带入（①② 是同一项目的两段，按省取的电价/利用小时/峰谷价差必须同源）；
  // 未传省份时保持现值——② 独立可用（投标测算）路径不经此函数，不受影响。
  // 需量推定快照随储能推荐一并带入（无储能推荐时置 null，② 不计需量收益）
  applyRecommendation: (recs, province) =>
    set((s) => ({
      inputs: {
        ...s.inputs,
        province: province || s.inputs.province,
        demand: recs.find((r) => r.key === 'storage')?.demand ?? null,
        systems: Object.fromEntries(
          Object.keys(s.inputs.systems).map((key) => {
            const rec = recs.find((r) => r.key === key)
            const adopt = Boolean(rec && (rec.level === '推荐' || rec.level === '可考虑'))
            return [
              key,
              {
                enabled: adopt,
                capacity: adopt ? String(rec.suggestedScale) : s.inputs.systems[key].capacity,
              },
            ]
          }),
        ),
      },
    })),
  reset: () => set({ feasibility: null, isFeasibleDone: false }),
}))
