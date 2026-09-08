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
  // 推理强度（DeepSeek v4 等推理模型：low/medium/high；GLM 等直出模型不适用）。
  // 默认 ''（不指定）→ 不发送该参数，默认 GLM 路径与改造前逐字节一致；
  // 在「API 设置」按供应商显式选择。属服务参数非计算系数，故存 aiStore 而非 configStore
  reasoningEffort: '',
  isGenerating: false,
  reportContent: '', // 已生成的方案正文 Markdown（五段，报告外壳由 ReportDocument 版式渲染）
  // 推理过程（reasoning_content 累积）：只作「思考中」实时反馈，永不并入 reportContent
  thinking: '',
  // 报告头徽章数据源：'ai'（模型流式）| 'local'（本地模板降级）| null（未生成）
  generationSource: null,
  logoDataUrl: '', // 公司 LOGO（内存态，同 apiKey 纪律：仅本次会话，刷新即清空，严禁持久化）
  error: null,

  setApiKey: (apiKey) => set({ apiKey }),
  setBaseURL: (baseURL) => set({ baseURL }),
  setModelName: (modelName) => set({ modelName }),
  setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setReportContent: (reportContent) => set({ reportContent }),
  setGenerationSource: (generationSource) => set({ generationSource }),
  setLogo: (logoDataUrl) => set({ logoDataUrl }),
  // 流式追加（打字机渲染，Sprint 4）：逐 chunk 拼接，避免整包替换
  appendReport: (chunk) => set((s) => ({ reportContent: s.reportContent + chunk })),
  appendThinking: (chunk) => set((s) => ({ thinking: s.thinking + chunk })),
  setError: (error) => set({ error }),
  clearReport: () => set({ reportContent: '', generationSource: null, thinking: '' }),
}))
