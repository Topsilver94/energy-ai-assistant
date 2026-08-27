/**
 * GLM-5 流式服务（OpenAI 兼容接口，CLAUDE.md §7）
 *
 * 职责拆分：
 *   buildPrompt          纯函数：把模块①② 快照 + 系数拼装成 system/user 消息（可单测）
 *   generateReportStream 服务函数：fetch + ReadableStream 解析 SSE，逐 chunk 回调
 *
 * 错误分型（必须给明确提示，不静默失败）：noKey / auth(401) / http / network / aborted
 * 红线：apiKey 只经请求头传输，不写日志、不持久化。
 */
import { PROJECT_TYPES } from '../stores/projectStore.js'
import { buildPhasing } from '../utils/phasing.js'
import { buildSensitivity } from '../utils/sensitivity.js'
import { coolingDesignKw } from '../utils/recommend.js'
import { newBuildMeasures } from '../data/measures.js'

const SYSTEM_PROMPT =
  '你是一位拥有 15 年经验的综合能源资深专家，擅长光伏、储能、供冷及节能改造项目的财务分析与技术落地。' +
  '请用专业、客观、数据驱动的语气撰写报告，严禁虚构数据，所有结论必须基于用户提供的数值。输出格式为 Markdown。' +
  '全文使用简体中文行文，不夹带英文单词或英文短语（如需表述请用中文，如「尖峰负荷」而非 peak demand）；' +
  '仅保留行业通用缩略语与计量单位，如 IRR、COP、kW/kWh/MW/MWh、tCO₂。'

const fmt = (n, digits = 1) => Number(n).toFixed(digits)

/**
 * 拼装对话消息（组合测算版）。
 * @param {{ inputs: { province, systems }, feasibility: object }} project 模块② 快照
 * @param {{ inputs: object, diagnosis: object }} diagnosis 模块① 快照（含 buildingType/year）
 * @param {object} config configStore 纯数值配置（系数快照整包注入，仅供合理性推断）
 */
export const buildPrompt = (project, diagnosis, config) => {
  const systems = project.inputs?.systems ?? {}
  const selected = PROJECT_TYPES.filter(
    (t) => systems[t.key]?.enabled && Number(systems[t.key].capacity) > 0,
  )
  const f = project.feasibility?.total ?? {}
  const items = project.feasibility?.items ?? []
  const d = diagnosis.diagnosis ?? {}
  const di = diagnosis.inputs ?? {}
  // 集中供冷双口径：已知建筑类型时折算设计冷负荷（设备口径）随组合描述注入，供 AI 表述供冷能力
  const combo = selected
    .map((t) => {
      const kw =
        t.key === 'cooling'
          ? coolingDesignKw(systems[t.key].capacity, d.buildingType ?? di.buildingType)
          : null
      return `${t.label} ${systems[t.key].capacity}${t.scaleUnit}${kw ? `（折算设计冷负荷约 ${kw} kW）` : ''}`
    })
    .join(' + ')
  const irr = Number.isFinite(f.irr) ? fmt(f.irr * 100) : '—'
  const payback = f.paybackPeriod === 'N/A' ? 'N/A' : fmt(f.paybackPeriod)
  const itemLines = items
    .map((it) => {
      const t = PROJECT_TYPES.find((x) => x.key === it.type)
      const itPayback = it.paybackPeriod === 'N/A' ? 'N/A' : fmt(it.paybackPeriod)
      return (
        `- ${t?.label ?? it.type}：规模 ${it.capacity}${t?.scaleUnit ?? ''}，` +
        `投资 ${fmt(it.totalInvestment, 2)} 万元，IRR ${fmt((it.irr ?? 0) * 100)}%，` +
        `回收期 ${itPayback} 年，碳减排 ${it.carbonReduction > 0 ? fmt(it.carbonReduction) : 0} tCO₂/a`
      )
    })
    .join('\n')

  // 建设节奏：确定性派生（非模型推断），注入后 AI 只润色措辞、不改结论与数字
  const phasing = buildPhasing(items, f)
  // 敏感性结论：系统单变量扰动重算（同页面敏感性表），同规注入——仅润色不改数字
  const sens = buildSensitivity(project.inputs, config)

  const user =
    '请根据以下项目数据生成一份 1 页式综合能源改造方案：\n\n' +
    '【组合概况】\n' +
    `系统组合：${combo}\n` +
    `地点：${project.inputs.province}\n\n` +
    '【组合财务总账】\n' +
    `投资估算：${fmt(f.totalInvestment, 2)} 万元\n` +
    `年毛收益：${fmt(f.annualRevenue)} 万元\n` +
    `IRR：${irr} %\n` +
    `回收期：${payback} 年\n` +
    `碳减排：${fmt(f.carbonReduction)} tCO₂/a\n\n` +
    '【分项明细】\n' +
    (itemLines || '—') +
    '\n\n' +
    '【敏感性分析（系统按单变量扰动确定性重算，请保留全部数字与结论，仅润色措辞）】\n' +
    (sens ? sens.summaryLines.map((l) => `- ${l}`).join('\n') : '—') +
    '\n\n' +
    '【能耗诊断数据】\n' +
    `建筑性质：${d.buildingNature === 'new' ? '新建' : '既有'}\n` +
    `建筑类型：${d.buildingType ?? di.buildingType ?? '—'}\n` +
    `建筑面积：${di.area ?? '—'} ㎡\n` +
    (d.buildingNature === 'new'
      ? `采用强度：${fmt(d.actualIntensity)} kWh/㎡·a（${d.designChecked ? '设计值' : '约束值预估'}）\n` +
        `约束值基准：${fmt(d.benchmarkIntensity, 0)} kWh/㎡·a\n` +
        `设计校核：${d.checkResult ?? '未校核（按约束值预估）'}\n` +
        `节能潜力：—（新建无实际能耗基线，待投产后核算）\n`
      : `建造年份：${di.year ?? '—'} 年\n` +
        `年用电量：${fmt(d.annualConsumption / 1e4)} 万 kWh\n` +
        `实际单位能耗：${fmt(d.actualIntensity)} kWh/㎡·a\n` +
        `行业基准能耗：${fmt(d.benchmarkIntensity, 0)} kWh/㎡·a\n` +
        `节能潜力：${fmt(d.savingPotential)} %\n` +
        `能效评级：${d.rating ?? '—'}\n`) +
    (d.buildingNature === 'new'
      ? '【技术路径参考（新建·一体化设计，确定性内容，可润色勿改结论）】\n' +
        newBuildMeasures.map((m, i) => `${i + 1}. ${m}`).join('\n') +
        '\n'
      : '') +
    '\n' +
    '【建设节奏建议（由系统按回收期确定性派生，请保留分期结论与全部数字，仅润色措辞）】\n' +
    (phasing ? phasing.lines.join('\n') : '—') +
    '\n\n' +
    '【当前系数快照（供参考，勿写入报告正文，但可用于推断合理性）】\n' +
    `${JSON.stringify(config)}\n\n` +
    '请按以下五段式结构输出（必须包含这五个一级标题）：\n' +
    '# 项目概述\n# 财务分析结论\n# 技术路径建议\n# 建设节奏建议\n# 预期收益与碳减排'

  return { system: SYSTEM_PROMPT, user }
}

/**
 * 流式生成方案。
 * @param {object} params { apiKey, baseURL, modelName, system, user, onChunk, onError, onComplete }
 *   onChunk(delta)  每个 SSE 增量；onError({type, message})；onComplete(fullText)
 * @returns {AbortController} 供调用方中止（停止生成）
 */
export const generateReportStream = ({
  apiKey,
  baseURL,
  modelName = 'glm-5',
  system,
  user,
  onChunk,
  onError,
  onComplete,
}) => {
  const controller = new AbortController()

  // 异步执行，立即返回中止句柄；错误一律走 onError，不抛出到调用方
  ;(async () => {
    try {
      const res = await fetch(baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName || 'glm-5',
          stream: true,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        if (res.status === 401) {
          onError({ type: 'auth', message: 'API Key 无效或已过期（401），请到「API 设置」检查' })
          return
        }
        let detail = ''
        try {
          detail = (await res.json())?.error?.message ?? ''
        } catch {
          /* 非 JSON 错误体，保持空 */
        }
        onError({
          type: 'http',
          message: `接口返回 ${res.status}${detail ? `：${detail}` : ''}`,
        })
        return
      }
      if (!res.body) {
        onError({ type: 'network', message: '响应无内容（流式通道不可用）' })
        return
      }

      // SSE 解析：按行切分，data: 前缀逐条 JSON.parse，取 choices[0].delta.content
      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let full = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // 最后一段可能是不完整行，留到下一轮
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const data = trimmed.slice(5).trim()
          if (!data || data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const delta = json.choices?.[0]?.delta?.content ?? ''
            if (delta) {
              full += delta
              onChunk(delta)
            }
          } catch {
            /* 半包或心跳行，跳过等下一轮补齐 */
          }
        }
      }
      onComplete(full)
    } catch (err) {
      if (err?.name === 'AbortError') {
        onError({ type: 'aborted', message: '已停止生成' })
        return
      }
      onError({ type: 'network', message: '网络中断或服务不可达，请检查网络后重试' })
    }
  })()

  return controller
}
