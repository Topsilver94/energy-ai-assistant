/**
 * 模块③ 一页式方案「本地模板正文」——组合测算版的降级生成引擎。
 *
 * 职责拆分（版式重构后）：报告头 / 执行摘要数据卡 / 分项明细表 / 敏感性结论 /
 * 参数附表 / 报告尾全部由 ReportDocument 版式组件确定性渲染；本模块（与 GLM-5
 * 主流程）只产五段正文文字，两条生成路径共用同一版式外壳——「确定性内核 + AI 润色」。
 * 段结构对齐 services/glm.js 的版式契约（五个二级标题，禁表格/一级标题）。
 * 「建设节奏建议」由 phasing.js 按回收期确定性派生，数字与本模块其余段落同源。
 *
 * 红线：模板里只出现文案与格式，所有数字来自入参（store 结果 + config 系数）。
 */
import { PROJECT_TYPES } from '../stores/projectStore.js'
import { getRecommendations, eraOf, pvMandatedHint } from './diagnosis.js'
import { buildPhasing } from './phasing.js'
import { coolingDesignKw, coolingTcoNote, STORAGE_FIRE_LINE } from './recommend.js'
import { newBuildMeasures } from '../data/measures.js'

const fmt = (n, digits = 1) => Number(n).toFixed(digits)

/** 选中系统列表（enabled 且规模 > 0），供组合描述复用 */
const selectedSystems = (systems) =>
  PROJECT_TYPES.filter((t) => systems[t.key]?.enabled && Number(systems[t.key].capacity) > 0)

/**
 * 按选中系统展开各系统最关键系数入快照表（可溯源性）。
 * 报告版式的「附：当次测算关键参数」表数据源，ReportDocument 渲染。
 */
export const keyParams = (systems, config, province) => {
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
        [
          '工程修正',
          `效率 ${config.storage.roundTripEfficiency} · DoD ${config.storage.depthOfDischarge} · 年可用 ${config.storage.availableDaysPerYear} 天 · 充电电价 ${config.storage.chargePricePerKwh} 元/kWh`,
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
 * @returns {string} 五段正文 Markdown（报告外壳由 ReportDocument 渲染）
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
  const isNew = d.buildingNature === 'new'
  const recommendations = isNew ? [] : getRecommendations(di.buildingType, d.savingPotential ?? 0)
  // 建成年代 → 标准代际侧重（既有注入；新建无年份语义）
  const era = isNew ? null : eraOf(di.year)
  const pvHint = era ? pvMandatedHint(di.year) : null

  const payback = f.paybackPeriod === 'N/A' ? 'N/A' : `${fmt(f.paybackPeriod)} 年`
  const measureTexts = isNew ? newBuildMeasures : recommendations.map((r) => r.text)
  const numberedMeasures = measureTexts.map((text, i) => `${i + 1}. ${text}`).join('\n')
  const phasing = buildPhasing(items, f)
  // 储能口径句（与报告外壳注记同源）：套利按代理购电固定分时 + 工程修正已计；需量收益计入状态如实
  const storageItem = items.find((it) => it.type === 'storage')
  // 集中供冷客户侧对比（确定性派生，客户视角签单钩子；AI 路径由 prompt 注入同款内容）
  const coolingTcoLine = selected.some((t) => t.key === 'cooling')
    ? coolingTcoNote(project.inputs.province, config)
    : null
  const storageScopeText = storageItem
    ? `储能套利按代理购电固定分时口径测算（已计效率/放电深度/年可用天数与充电损耗工程修正），市场化交易用户需按现货价差重估（行业情景中枢约下移 30%）；` +
      (storageItem.demandDetail && !storageItem.demandDetail.skipped
        ? `需量管理收益已按推定需量基数计入（削峰 ${Math.round(storageItem.demandDetail.shavedKw)} kW）。`
        : storageItem.demandDetail?.skipped
          ? '需量管理收益未计入（推定容量低于两部制门槛）。'
          : '需量管理与现货/需求响应/辅助服务收益未计入确定性测算，属后续深化潜力。')
    : ''

  // 五段正文（二级标题与 GLM-5 版式契约逐字一致；数据表由版式系统渲染，正文只叙述）
  return (
    '## 一、项目概述\n\n' +
    `- **系统组合**：${combo}（落地省份 ${project.inputs.province}）\n` +
    `- **建筑概况**：${isNew ? '新建' : '既有'}${di.buildingType ?? '—'}建筑 · ${di.area ?? '—'} ㎡${isNew ? '' : ` · ${di.year ?? '—'} 年建成${era ? ` · ${era.label}` : ''}`}\n` +
    `- **诊断结论**：${
      isNew
        ? d.designChecked
          ? `设计强度 ${fmt(d.actualIntensity)} kWh/㎡·a vs 约束值 ${d.benchmarkIntensity} kWh/㎡·a，${d.checkResult}`
          : `按约束值 ${d.benchmarkIntensity} kWh/㎡·a 预估年用电量 ${fmt(d.annualConsumption / 1e4)} 万 kWh`
        : `实际能耗强度 ${fmt(d.actualIntensity)} kWh/㎡·a，对标基准 ${d.benchmarkIntensity ?? '—'} kWh/㎡·a，能效评级「${d.rating ?? '—'}」${d.estimate ? '（电费未知，按预估口径推演，补电费单后转实测对标）' : ''}`
    }\n\n` +
    '## 二、财务分析\n\n' +
    `组合投资估算 ${fmt(f.totalInvestment, 2)} 万元，年毛收益 ${fmt(f.annualRevenue)} 万元/年，IRR ${fmt((f.irr ?? 0) * 100)} %，静态回收期 ${payback}（按合并现金流测算，共同计算期取各系统寿命最大值）；年碳减排 ${fmt(f.carbonReduction)} tCO₂。${storageScopeText}分项明细与敏感性结论见执行摘要数据表。\n\n` +
    `## 三、技术路径建议（${isNew ? '新建 · 一体化设计' : '模块① 诊断建议'}）\n\n` +
    `${numberedMeasures || '—'}\n` +
    // 布置红线仅出模块③（本地路径技术段注记；AI 路径由 prompt 注入同款内容）
    (storageItem ? `\n> 注：${STORAGE_FIRE_LINE}\n` : '') +
    (era
      ? `\n> 注：建成于 ${di.year} 年 · ${era.label}：${era.focus}。${pvHint ? ` ${pvHint}。` : ''}\n`
      : '') +
    '\n## 四、建设节奏建议\n\n' +
    `${phasing ? phasing.lines.join('\n') : '—'}\n\n` +
    '## 五、预期收益与碳减排\n\n' +
    `- ${
      isNew
        ? '节能潜力待投产后按实测核算（新建无实际能耗基线）'
        : `节能潜力 **${fmt(d.savingPotential)} %**（能效评级「${d.rating ?? '—'}」）`
    }\n` +
    `- 组合年碳减排 ${fmt(f.carbonReduction)} tCO₂\n` +
    (coolingTcoLine ? `- ${coolingTcoLine}\n` : '')
  )
}
