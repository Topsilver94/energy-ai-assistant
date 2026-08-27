/**
 * 建设节奏建议（模块③ 方案章节之一）—— 确定性派生，非 AI 生成。
 *
 * 定位：帮客户决定「先建什么、后建什么」的是测算数字本身，不是模型措辞。
 * 本函数从模块② 组合测算结果推导分期，供本地模板（report.js）与 GLM-5
 * Prompt（glm.js）共用；AI 仅润色措辞，分期结论与数字以本函数输出为准。
 *
 * 分期规则（零阈值常数、全部自参照，不引入任何可调系数）：
 *   - 分界线 = 组合整体静态回收期：分项回收期 ≤ 组合整体 → 一期；> 组合整体 → 二期
 *     （快于组合整体的分项拉高组合收益，先建；慢的被一期现金流铺垫）
 *   - 回收期 N/A（年净现金流 ≤ 0）的分项列入「观察项」，如实注明，不硬排期
 *   - 组合整体回收期 N/A 时不分二期，正回收分项按回收期排序展示
 *   - 单系统：一句话建议一次性建成，不展开分期
 * 输出每行都带可溯源数字（投资 / 回收期 / 与组合整体的比较）。
 */
import { PROJECT_TYPES } from '../stores/projectStore.js'

const fmt = (n, digits = 1) => Number(n).toFixed(digits)

/** 系统显示名：标签 + 规模 + 单位（与分项明细表同口径） */
const systemName = (it) => {
  const t = PROJECT_TYPES.find((x) => x.key === it.type)
  return `${t?.label ?? it.type} ${it.capacity}${t?.scaleUnit ?? ''}`
}

/**
 * @param {Array} items 模块② feasibility.items（含 paybackPeriod / totalInvestment）
 * @param {object} total 模块② feasibility.total（含 paybackPeriod）
 * @returns {{ single: boolean, lines: string[] } | null} 展示行数组；无分项时 null
 */
export const buildPhasing = (items, total) => {
  if (!Array.isArray(items) || items.length === 0) return null

  // 单系统：无组合分期必要，一句话收束（回收期一并复述，保持可溯源）
  if (items.length === 1) {
    const [it] = items
    return Number.isFinite(it.paybackPeriod)
      ? {
          single: true,
          lines: [
            `单系统方案，建议一次性建成，无组合分期必要（静态回收期 ${fmt(it.paybackPeriod)} 年）。`,
          ],
        }
      : {
          single: true,
          lines: ['单系统方案；当前参数下年净现金流 ≤ 0，建议复核规模与参数后再决策。'],
        }
  }

  const combo = Number.isFinite(total?.paybackPeriod) ? total.paybackPeriod : null
  const valid = items
    .filter((it) => Number.isFinite(it.paybackPeriod))
    .sort((a, b) => a.paybackPeriod - b.paybackPeriod)
  const watch = items.filter((it) => !Number.isFinite(it.paybackPeriod))

  let phase1 = valid
  let phase2 = []
  if (combo !== null) {
    phase1 = valid.filter((it) => it.paybackPeriod <= combo)
    phase2 = valid.filter((it) => it.paybackPeriod > combo)
  }

  const lines = []
  lines.push(
    combo !== null
      ? `分期按静态回收期与组合整体（${fmt(combo)} 年）比较派生：快于整体的先建，慢于的靠一期现金流铺垫。`
      : '组合整体回收期不可计算（年净现金流 ≤ 0），以下仅按分项回收期排序展示，不排二期。',
  )

  // 一期一定非空（组合整体回收期介于分项最快最慢之间）；二期/观察项按需输出
  if (phase1.length > 0) {
    lines.push('**一期（优先启动）**')
    phase1.forEach((it) =>
      lines.push(
        combo !== null
          ? `- ${systemName(it)} —— 投资 ${fmt(it.totalInvestment, 2)} 万元，静态回收期 ${fmt(it.paybackPeriod)} 年（快于组合整体 ${fmt(combo)} 年）`
          : `- ${systemName(it)} —— 投资 ${fmt(it.totalInvestment, 2)} 万元，静态回收期 ${fmt(it.paybackPeriod)} 年`,
      ),
    )
  }
  if (phase2.length > 0) {
    lines.push('**二期（视一期运行情况启动）**')
    phase2.forEach((it) =>
      lines.push(
        `- ${systemName(it)} —— 投资 ${fmt(it.totalInvestment, 2)} 万元，静态回收期 ${fmt(it.paybackPeriod)} 年（慢于组合整体 ${fmt(combo)} 年）`,
      ),
    )
  }
  if (watch.length > 0) {
    lines.push('**观察项（暂不排期）**')
    watch.forEach((it) =>
      lines.push(
        `- ${systemName(it)} —— 投资 ${fmt(it.totalInvestment, 2)} 万元，当前参数下年净现金流 ≤ 0（回收期 N/A），列为观察项`,
      ),
    )
  }

  return { single: false, lines }
}
