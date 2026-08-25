import { create } from 'zustand'

/**
 * 模块③ AI 基础设施（Sprint 3 底座，Sprint 4 接入 GLM-5 流式生成）
 *
 * 红线（CLAUDE.md §7/§9）：apiKey 仅存内存 state，由「API 设置」弹窗写入，
 * 严禁写入 localStorage / 代码仓库 / console，页面刷新即清空。
 */
export const useAiStore = create((set) => ({
  apiKey: '',
  baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  modelName: 'glm-5',
  isGenerating: false,
  reportContent: '', // 已生成的方案 Markdown
  error: null,

  setApiKey: (apiKey) => set({ apiKey }),
  setBaseURL: (baseURL) => set({ baseURL }),
  setModelName: (modelName) => set({ modelName }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setReportContent: (reportContent) => set({ reportContent }),
  // 流式追加（打字机渲染，Sprint 4）：逐 chunk 拼接，避免整包替换
  appendReport: (chunk) => set((s) => ({ reportContent: s.reportContent + chunk })),
  setError: (error) => set({ error }),
  clearReport: () => set({ reportContent: '' }),
}))
