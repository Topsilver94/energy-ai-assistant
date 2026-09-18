/**
 * AI 流式服务（OpenAI 兼容接口，CLAUDE.md §7；baseURL/modelName 来自「API 设置」，适配 GLM-5 / DeepSeek 等）
 *
 * 职责拆分：
 *   buildPrompt          纯函数：把模块①② 快照 + 系数拼装成 system/user 消息（可单测）
 *   generateReportStream 服务函数：fetch + ReadableStream 解析 SSE，逐 chunk 回调
 *
 * DeepSeek v4 系为推理模型：先流 reasoning_content（应用侧作「思考中」反馈，绝不并入正文）再流 content。
 * 推理强度经 reasoning_effort 控制：low 将首段正文延迟压至 ~5s，medium/high 推理可达数十秒。
 *
 * 错误分型（必须给明确提示，不静默失败）：noKey / auth(401) / http / network / aborted
 * 红线：apiKey 只经请求头传输，不写日志、不持久化。
 */
import { PROJECT_TYPES } from '../stores/projectStore.js'
import { formatIrr } from '../utils/finance.js'
import { buildPhasing } from '../utils/phasing.js'
import { buildSensitivity } from '../utils/sensitivity.js'
import { coolingDesignKw, coolingTcoNote, STORAGE_FIRE_LINE } from '../utils/recommend.js'
import { newBuildMeasures } from '../data/measures.js'
import { eraOf, pvMandatedHint } from '../utils/diagnosis.js'
import { SPREAD_AS_OF } from '../data/coefficients.js'

const SYSTEM_PROMPT =
  '你是一位拥有 15 年经验的综合能源资深专家，擅长光伏、储能、供冷及节能改造项目的财务分析与技术落地。' +
  '请用专业、客观、数据驱动的语气撰写报告，严禁虚构数据，所有结论必须基于用户提供的数值。\n' +
  '版式契约（必须严格遵守）：\n' +
  '1. 只输出五个段落，段标题为二级标题且逐字使用：## 一、项目概述 / ## 二、财务分析 / ## 三、技术路径建议 / ## 四、建设节奏建议 / ## 五、预期收益与碳减排；不得输出一级标题、不得增删段落数。\n' +
  '2. 严禁输出 Markdown 表格、代码块、图片——报告标题、数据卡与全部数据表由版式系统另行渲染，你只负责正文行文。\n' +
  '3. 每段第一句先给结论，再展开依据（结论先行）；以短段落与要点列表为主，不写空话套话。\n' +
  '4. 全文使用简体中文行文，不夹带英文单词或英文短语（如需表述请用中文，如「尖峰负荷」而非 peak demand）；' +
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
  // 建成年代 → 标准代际侧重（既有注入，确定性派生；新建无年份语义不注入）
  const era = d.buildingNature === 'new' ? null : eraOf(di.year)
  const pvHint = era ? pvMandatedHint(di.year) : null
  // 集中供冷双口径：已知建筑类型时折算设计冷负荷（设备口径）随组合描述注入，供 AI 表述供冷能力
  const combo = selected
    .map((t) => {
      const kw =
        t.key === 'cooling'
          ? coolingDesignKw(systems[t.key].capacity, d.buildingType ?? di.buildingType, config)
          : null
      return `${t.label} ${systems[t.key].capacity}${t.scaleUnit}${kw ? `（折算设计冷负荷约 ${kw} kW）` : ''}`
    })
    .join(' + ')
  const irr = Number.isFinite(f.irr) ? formatIrr(f.irr, f.paybackPeriod) : '—'
  const payback = f.paybackPeriod === 'N/A' ? 'N/A' : fmt(f.paybackPeriod)
  const itemLines = items
    .map((it) => {
      const t = PROJECT_TYPES.find((x) => x.key === it.type)
      const itPayback = it.paybackPeriod === 'N/A' ? 'N/A' : fmt(it.paybackPeriod)
      return (
        `- ${t?.label ?? it.type}：规模 ${it.capacity}${t?.scaleUnit ?? ''}，` +
        `投资 ${fmt(it.totalInvestment, 2)} 万元，IRR ${formatIrr(it.irr ?? 0, it.paybackPeriod)}，` +
        `回收期 ${itPayback} 年，碳减排 ${it.carbonReduction > 0 ? fmt(it.carbonReduction) : 0} tCO₂/a`
      )
    })
    .join('\n')

  // 建设节奏：确定性派生（非模型推断），注入后 AI 只润色措辞、不改结论与数字
  const phasing = buildPhasing(items, f)
  // 敏感性结论：系统单变量扰动重算（同页面敏感性表），同规注入——仅润色不改数字
  const sens = buildSensitivity(project.inputs, config)
  // 储能运行模式：分省分时结构判定（确定性内容，同模块① 触发依据；收益数字已按此口径计算）
  const storageCycles = config.provinces?.[project.inputs.province]?.cyclesPerDay ?? 1
  const storageModeLine =
    storageCycles >= 2
      ? `运行模式：${project.inputs.province}分时结构支持两充两放，第二循环按约半额价差折算（收益已按此口径计算）`
      : `运行模式：${project.inputs.province}分时结构按一充一放测算，可叠加需量管理增厚收益`
  // 光储协同定性提示：组合同时含光伏与储能、且为两充两放省（存在午间充电窗口）时注入
  const pvStorageSynergy =
    selected.some((t) => t.key === 'pv') && selected.some((t) => t.key === 'storage') && storageCycles >= 2
      ? '光储协同：午间第二循环充电窗口与光伏大发时段重叠，可消纳光伏余电、提升自用率并防逆流（定性提示，收益仍按峰谷价差口径计）'
      : null
  // 储能口径边界与需量注记（确定性内容，同报告版式外壳注记；AI 仅润色，不得改数字与方向）
  const storageScopeLine =
    `测算口径：套利按电网代理购电固定分时（${SPREAD_AS_OF}代理购电表），已计系统效率/放电深度/年可用天数与充电损耗工程修正；` +
    '用户转入市场化交易后固定分时价差不再执行，收益需按现货价差重估（行业情景中枢约下移 30%）'
  const dd = items.find((it) => it.type === 'storage')?.demandDetail
  // 需量口径：baseKw 来自负荷曲线时为实测值，否则为双口径推定——据快照标记切换措辞，
  // 不把实测写成推定（口径溯源是红线，AI 收到什么口径就写什么口径）
  const demandLine = dd && !dd.skipped
    ? `需量管理收益已计入：${dd.measured ? `实测最大需量约 ${Math.round(dd.baseKw)} kW（负荷曲线${dd.intervalMin ? ` ${dd.intervalMin} 分钟口径` : ''}）` : `推定最大需量约 ${Math.round(dd.baseKw)} kW`}，削峰 ${Math.round(dd.shavedKw)} kW × ${dd.price.toFixed(0)} 元/kW·月（两部制按需量计费推定，计费方式以电费单「基本电费」科目核定，容量计费用户无此项收益${dd.monthlyPerKva >= 260 ? '；月每 kVA 用电 ≥260 kWh 按 90% 档' : ''}）`
    : dd?.skipped
      ? '需量管理收益未计入：推定变压器容量低于两部制门槛 315 kVA，按单一制口径'
      : '需量管理收益未计入（无模块① 诊断负荷推定）'
  const upsideLine =
    '收益深化潜力（未计入测算数字，属或有收益，可定性提及、严禁虚构数字）：现货市场套利（市场化用户轨道）；需求响应/虚拟电厂聚合（上海案例结算价最高约 9 元/kWh）；辅助服务（调峰/调频/备用）；' +
    (dd?.measured
      ? '负荷曲线已接入实测口径，深化路径为逐时充放策略仿真，进一步核定储能定容与削峰策略'
      : '深化路径为 15 分钟级负荷曲线实测 + 逐时仿真')
  // 集中供冷客户侧对比（确定性派生，同模块① 冷却触发依据；AI 仅润色不改数字）
  const coolingTco = selected.some((t) => t.key === 'cooling')
    ? coolingTcoNote(project.inputs.province, config)
    : null

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
    (selected.some((t) => t.key === 'storage')
      ? '【储能运行与布置（确定性内容，请保留标准号与数字，仅润色措辞）】\n' +
        `${storageModeLine}\n` +
        `${storageScopeLine}\n` +
        `${demandLine}\n` +
        (pvStorageSynergy ? `${pvStorageSynergy}\n` : '') +
        `${upsideLine}\n` +
        `${STORAGE_FIRE_LINE}\n\n`
      : '') +
    (selected.some((t) => t.key === 'cooling') && coolingTco
      ? '【集中供冷客户价值（确定性内容，请保留数字，仅润色措辞）】\n' + `${coolingTco}\n\n`
      : '') +
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
      : `建造年份：${di.year ?? '—'} 年${era ? `，属${era.label}` : ''}\n` +
        (era ? `年代改造侧重：${era.focus}（按标准代际确定性派生，润色时保持方向与结论）\n` : '') +
        (pvHint ? `光伏余量提示：${pvHint}（确定性提示，请保留）\n` : '') +
        `年用电量：${fmt(d.annualConsumption / 1e4)} 万 kWh${d.estimate ? '（预估）' : d.curve ? '（负荷曲线实测）' : ''}\n` +
        `实际单位能耗：${fmt(d.actualIntensity)} kWh/㎡·a${d.estimate ? '（电费未知，按典型强度/变压器口径预估）' : d.curve ? '（曲线实测口径）' : ''}\n` +
        `行业基准能耗：${fmt(d.benchmarkIntensity, 0)} kWh/㎡·a\n` +
        (d.curve
          ? `负荷曲线实测：最大需量 ${Math.round(d.curve.maxKw)} kW · 负荷率 ${Math.round(d.curve.loadFactor * 100)}% · ${d.curve.intervalMin} 分钟粒度（需量与定容按此口径，请保留）\n`
          : '') +
        `节能潜力：${fmt(d.savingPotential)} %${d.estimate ? '（预估口径，典型值推演非实测对标，请保留此标注）' : ''}\n` +
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
    '请按版式契约输出正文（五个二级标题逐字使用，禁止一级标题、表格与其他任何标题）：\n' +
    '## 一、项目概述\n## 二、财务分析\n## 三、技术路径建议\n## 四、建设节奏建议\n## 五、预期收益与碳减排\n' +
    '执行摘要数据卡、分项明细表与敏感性结论由版式系统渲染，正文用文字叙述关键数字即可，不要以表格形式重复罗列。'

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
  reasoningEffort,
  system,
  user,
  onChunk,
  onThinking,
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
          // DeepSeek v4 推理强度：low 把首段正文延迟压到 ~5s（medium/high 推理可达数十秒，
          // 应用侧默认 low）；GLM-5 忽略该参数，不影响默认路径
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
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
            const delta = json.choices?.[0]?.delta ?? {}
            const text = delta.content ?? ''
            if (text) {
              full += text
              onChunk(text)
            }
            // 推理过程独立回调：应用侧只作「思考中」反馈，不并入 reportContent（红线）
            if (delta.reasoning_content) onThinking?.(delta.reasoning_content)
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
