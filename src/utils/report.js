/**
 * 模块③ 一页式方案「本地模板底座」——组合测算版的生成引擎。
 *
 * 职责：把模块①② 的结构化结果（组合分项 + 总账）+ 当次使用的系数快照拼装成
 * 五段式 Markdown（项目概述 / 财务分析 / 技术路径 / 建设节奏建议 / 预期收益，
 * 结构对齐 CLAUDE.md §7 的 GLM-5 Prompt 模板）。主流程为 GLM-5 流式生成
 * （services/glm.js），API Key 未填或调用失败时自动回退到本模板。
 * 「建设节奏建议」由 phasing.js 按回收期确定性派生，数字与本模板其余段落同源。
 *
 * 红线：模板里只出现文案与格式，所有数字来自入参（store 结果 + config 系数）。
 */
import { PROJECT_TYPES } from '../stores/projectStore.js'
import { getRecommendations, eraOf, pvMandatedHint } from './diagnosis.js'
import { buildPhasing } from './phasing.js'
import { buildSensitivity } from './sensitivity.js'
import { coolingDesignKw } from './recommend.js'
import { newBuildMeasures } from '../data/measures.js'

const fmt = (n, digits = 1) => Number(n).toFixed(digits)

/** 选中系统列表（enabled 且规模 > 0），供组合描述与参数快照复用 */
const selectedSystems = (systems) =>
  PROJECT_TYPES.filter((t) => systems[t.key]?.enabled && Number(systems[t.key].capacity) > 0)

/** 按选中系统展开各系统最关键系数入快照表（可溯源性） */
const keyParams = (systems, config, province) => {
  const prov = config.provinces[province] ?? Object.values(config.provinces)[0]
  const rows = [
    ['工商业电价', `${prov.elecPrice} 元/kWh（${config.provinces[province] ? province : '默认'}）`],
    ['电网排放因子', `${config.general.gridEmissionFactor} tCO₂/MWh`],
  ]
  for (const t of selectedSystems(systems)) {
    if (t.key === 'pv') {
      rows.push(
        ['光伏单位造价', `${config.pv.capexPerWatt} 元/W`],
        ['年等效利用小时', `${prov.sunHours} h`],
      )
    }
    if (t.key === 'storage') {
      rows.push(
        ['储能单位造价', `${config.storage.capexPerKWh} 元/kWh`],
        [
          '分时结构',
          `${prov.cyclesPerDay >= 2 ? '两充两放（第二循环按约半额价差折算）' : '一充一放'}（${province}）`,
        ],
      )
    }
    if (t.key === 'cooling') {
      rows.push(
        ['供冷单位投资', `${config.cooling.capexPerSqm} 元/㎡`],
        ['冷价', `${config.cooling.coolingPricePerKwh} 元/kWh`],
        ['COP（分散→集中）', `${config.cooling.copBaseline} → ${config.cooling.cop}`],
      )
    }
    if (t.key === 'charger') {
      rows.push(
        ['单桩造价', `${config.charger.capexPerPile} 元/桩`],
        ['单桩日均充电量', `${config.charger.dailyKwhPerPile} kWh`],
        ['充电服务费单价', `${config.charger.serviceFee} 元/kWh`],
        ['平台抽成', `${config.charger.platformCutRatio * 100}%`],
      )
    }
  }
  return rows
}

/**
 * @param {{ inputs: { province, systems }, feasibility: object }} project 模块② store 快照
 * @param {{ inputs: object, diagnosis: object }} diagnosis 模块① store 快照
 * @param {object} config configStore 纯数值配置
 * @returns {string} Markdown 方案文本
 * @throws 未选择任何系统时抛错（生成前应有测算结果兜底）
 */
export const buildReportDraft = (project, diagnosis, config) => {
  const systems = project.inputs?.systems ?? {}
  const selected = selectedSystems(systems)
  if (selected.length === 0) throw new Error('未选择任何系统，无法生成方案')

  const f = project.feasibility?.total ?? {}
  const items = project.feasibility?.items ?? []
  const d = diagnosis.diagnosis ?? {}
  const di = diagnosis.inputs ?? {}
  // 集中供冷双口径：已知建筑类型时折算设计冷负荷（设备口径）一并写入组合描述
  const combo = selected
    .map((t) => {
      const kw =
        t.key === 'cooling'
          ? coolingDesignKw(systems[t.key].capacity, d.buildingType ?? di.buildingType, config)
          : null
      return `${t.label} ${systems[t.key].capacity}${t.scaleUnit}${kw ? `（折算设计冷负荷约 ${kw} kW）` : ''}`
    })
    .join(' + ')
  const date = new Date().toLocaleString('zh-CN', { hour12: false })
  const isNew = d.buildingNature === 'new'
  const recommendations = isNew ? [] : getRecommendations(di.buildingType, d.savingPotential ?? 0)
  // 建成年代 → 标准代际侧重（既有注入；新建无年份语义）
  const era = isNew ? null : eraOf(di.year)
  const pvHint = era ? pvMandatedHint(di.year) : null

  const payback = f.paybackPeriod === 'N/A' ? 'N/A' : `${fmt(f.paybackPeriod)} 年`
  const params = keyParams(systems, config, project.inputs.province)
  const measureTexts = isNew ? newBuildMeasures : recommendations.map((r) => r.text)
  const numberedMeasures = measureTexts.map((text, i) => `${i + 1}. ${text}`).join('\n')
  const phasing = buildPhasing(items, f)
  // 敏感性结论（确定性重算）：与页面敏感性表同源共用，数字不经过模型
  const sens = buildSensitivity(project.inputs, config)
  const sensLines = sens ? sens.summaryLines.map((l) => `- ${l}`).join('\n') : '—'
  const itemRows = items
    .map((it) => {
      const t = PROJECT_TYPES.find((x) => x.key === it.type)
      const itPayback = it.paybackPeriod === 'N/A' ? 'N/A' : fmt(it.paybackPeriod)
      const carbon = it.carbonReduction > 0 ? fmt(it.carbonReduction) : '—'
      return `| ${t?.label ?? it.type} | ${it.capacity} ${t?.scaleUnit ?? ''} | ${fmt(it.totalInvestment, 2)} | ${fmt((it.irr ?? 0) * 100)} % | ${itPayback} | ${carbon} |`
    })
    .join('\n')

  return `# 综合能源节能改造方案（草案）

> 由「综合能源AI助手」本地模板生成 · ${date} ·（GLM-5 不可用时的降级方案）

## 一、项目概述

- **系统组合**：${combo}（落地省份 ${project.inputs.province}）
- **建筑概况**：${isNew ? '新建' : '既有'}${di.buildingType ?? '—'}建筑 · ${di.area ?? '—'} ㎡${isNew ? '' : ` · ${di.year ?? '—'} 年建成${era ? ` · ${era.label}` : ''}`}
- **诊断结论**：${
    isNew
      ? d.designChecked
        ? `设计强度 ${fmt(d.actualIntensity)} kWh/㎡·a vs 约束值 ${d.benchmarkIntensity} kWh/㎡·a，${d.checkResult}`
        : `按约束值 ${d.benchmarkIntensity} kWh/㎡·a 预估年用电量 ${fmt(d.annualConsumption / 1e4)} 万 kWh`
      : `实际能耗强度 ${fmt(d.actualIntensity)} kWh/㎡·a，对标基准 ${d.benchmarkIntensity ?? '—'} kWh/㎡·a，能效评级「${d.rating ?? '—'}」${d.estimate ? '（电费未知，按预估口径推演，补电费单后转实测对标）' : ''}`
  }

## 二、财务分析（组合总账）

| 指标 | 数值 |
| --- | --- |
| 组合投资估算 | ${fmt(f.totalInvestment, 2)} 万元 |
| 组合年毛收益 | ${fmt(f.annualRevenue)} 万元/年 |
| 组合 IRR | ${fmt((f.irr ?? 0) * 100)} % |
| 组合静态回收期 | ${payback} |
| 组合年碳减排 | ${fmt(f.carbonReduction)} tCO₂ |

### 分项明细

| 系统 | 规模 | 投资 · 万元 | IRR | 回收期 · 年 | 碳减排 · tCO₂/a |
| --- | --- | --- | --- | --- | --- |
${itemRows}

> 组合 IRR / 回收期按合并现金流测算（共同计算期取各系统寿命最大值，到期归零）；充电桩不计碳减排。

### 敏感性分析（单变量扰动 ±10% / ±20%）

${sensLines}

## 三、技术路径（${isNew ? '新建 · 一体化设计建议' : '模块① 诊断建议'}）

${numberedMeasures || '—'}
${era ? `\n> 注：建成于 ${di.year} 年 · ${era.label}：${era.focus}。${pvHint ? ` ${pvHint}。` : ''}\n` : ''}
## 四、建设节奏建议（按回收期确定性派生）

${phasing ? phasing.lines.join('\n') : '—'}

## 五、预期收益

- ${
    isNew
      ? '节能潜力待投产后按实测核算（新建无实际能耗基线）'
      : `节能潜力 **${fmt(d.savingPotential)} %**（能效评级「${d.rating ?? '—'}」）`
  }
- 组合年碳减排 ${fmt(f.carbonReduction)} tCO₂

## 附：当次测算关键参数（专家参数面板可调）

| 参数 | 当次取值 |
| --- | --- |
${params.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}
`
}
