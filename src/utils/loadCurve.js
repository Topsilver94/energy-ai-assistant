/**
 * 负荷曲线解析（模块① 既有建筑选填输入）—— 纯函数，不 import store（同 finance.js 纪律）。
 *
 * 定位：把客户侧导出的全年逐时/逐 15 分钟功率表（CSV/TSV，Excel 或采集系统导出）
 * 解析成「实测口径」统计量，替代电费反推的年用电量，并为储能定容/需量推定提供
 * 实测最大需量。v1 边界（如实注明，不硬造）：不做峰谷平电量分布、不做逐时充放
 * 策略仿真——峰段可转移系数仍按年度电量口径（方案阶段代理系数）。
 *
 * 口径约定：
 *   - 年用电量 = 平均功率 × 8760h（年均化，对不足整年的部分年数据同样成立）
 *   - 最大需量 = 曲线最大值（两部制需量电表为 15 分钟平均口径：15 分钟粒度数据
 *     即同口径；更粗粒度偏保守、更细粒度略偏高，均在质量注记中如实声明）
 *   - 负荷率 = 平均功率 ÷ 最大功率
 *
 * 容错设计（客户文件不会干净）：
 *   - 编码：UTF-8 优先，解码出替换字符时回退 GB18030（Excel 中文默认导出编码）
 *   - 分隔符：逗号 / 制表符 / 分号 / 竖线自动探测，无分隔符按空白切
 *   - 数值列：取每行最后一个可解析为数字的字段（时间戳在前、功率在后的常见导出
 *     布局）；表头行与非数值行自动跳过
 *   - 粒度：带时间戳列 → 相邻时间差实证；无时间戳 → 按行数就近匹配
 *     1/5/15/30/60 分钟档（注记「按行数推断」）
 */

// 候选采样粒度（分钟）：无时间戳时按行数就近匹配
const INTERVAL_CANDIDATES = [1, 5, 15, 30, 60]
// 行数下限：不足一天（15 分钟粒度 96 点）判为无效文件
const MIN_POINTS = 96
// 不足整年判定阈值（天）：低于 350 天挂「外推」注记
const FULL_YEAR_DAYS = 350

// 行 → 数值：剥离空白与千分位（逗号分隔文件中数值内不含逗号，安全）
const toNumber = (raw, delim) => {
  let s = String(raw).trim()
  if (!s) return null
  if (delim !== ',') s = s.replace(/,/g, '')
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

// 时间戳可解析性：交给 Date.parse（ISO / 常见「2025-01-01 00:15:00」等），NaN 视为非时间列
const parseTime = (raw) => {
  const t = Date.parse(String(raw).trim())
  return Number.isNaN(t) ? null : t
}

/**
 * @param {ArrayBuffer} buffer 上传文件的原始字节（组件侧 file.arrayBuffer() 取得）
 * @param {string} fileName 仅用于回显与注记，不参与解析
 * @returns {{ ok: true, stats: object } | { ok: false, error: string }}
 *   stats: { fileName, rows, intervalMin, hasTimestamp, days, avgKw, maxKw,
 *            loadFactor, annualKwh, coveredKwh, notes: string[] }
 */
export const parseLoadCurve = (buffer, fileName = '') => {
  // ── 编码：UTF-8 严格解码失败 → GB18030（GBK 超集，覆盖 Excel 中文导出） ──
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    try {
      text = new TextDecoder('gb18030').decode(buffer)
    } catch {
      text = new TextDecoder('utf-8').decode(buffer) // 环境缺 GB18030 时的最后兜底
    }
  }

  // ── 分隔符探测：取前几个非空行中各候选分隔符出现次数最多者 ──
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { ok: false, error: '文件为空或未识别到内容' }
  const sample = lines.slice(0, 5).join('\n')
  const delims = [',', '\t', ';', '|']
  let delim = null
  let best = 0
  for (const d of delims) {
    const n = sample.split(d).length - 1
    if (n > best) {
      best = n
      delim = d
    }
  }
  const splitLine = (l) => (delim ? l.split(delim) : l.trim().split(/\s+/))

  // ── 数值提取：每行取最后一个可解析字段；首字段可解析为时间则记时间戳列 ──
  const values = []
  let firstTs = null
  let secondTs = null
  let negativeCount = 0
  let zeroCount = 0
  for (const line of lines) {
    const fields = splitLine(line)
    let v = null
    for (let i = fields.length - 1; i >= 0; i--) {
      v = toNumber(fields[i], delim)
      if (v !== null) break
    }
    if (v === null) continue // 表头 / 备注行：整行无数值，跳过
    values.push(v)
    if (v < 0) negativeCount++
    if (v === 0) zeroCount++
    if (firstTs === null && fields.length >= 2) {
      const t = parseTime(fields[0])
      if (t !== null && toNumber(fields[fields.length - 1], delim) !== null) {
        firstTs = t
      }
    } else if (firstTs !== null && secondTs === null) {
      const t = parseTime(fields[0])
      if (t !== null) secondTs = t
    }
  }

  if (values.length < MIN_POINTS) {
    return {
      ok: false,
      error: `有效功率点仅 ${values.length} 个（不足一天），请检查是否导出完整曲线`,
    }
  }

  // ── 粒度识别：时间戳实证优先，否则按行数就近匹配候选档 ──
  const notes = []
  let hasTimestamp = false
  let intervalMin = null
  if (firstTs !== null && secondTs !== null) {
    const diff = (secondTs - firstTs) / 60000
    if (diff > 0 && diff <= 1440) {
      intervalMin = Math.round(diff)
      hasTimestamp = true
    }
  }
  if (intervalMin === null) {
    // 期望行数 = 365 天 × 每天点数；就近匹配（对闰年/缺测有天然容差）
    intervalMin = INTERVAL_CANDIDATES.reduce((bestI, c) =>
      Math.abs(values.length - (365 * 1440) / c) <
      Math.abs(values.length - (365 * 1440) / bestI)
        ? c
        : bestI,
    )
    notes.push(`未识别到时间戳列，采样粒度按行数推断为 ${intervalMin} 分钟`)
  }

  // ── 统计量 ──
  const sum = values.reduce((a, b) => a + b, 0)
  const avgKw = sum / values.length
  const maxKw = Math.max(...values)
  if (!(maxKw > 0)) return { ok: false, error: '功率列全为零或负值，无法构成有效负荷' }

  const days = (values.length * intervalMin) / 1440
  const coveredKwh = (sum * intervalMin) / 60 // 覆盖期内电量（区间均值 × 区间时长）
  const annualKwh = avgKw * 8760 // 年化：平均功率 × 全年小时（部分年数据同式外推）
  const loadFactor = avgKw / maxKw

  // 质量注记：只描述事实与口径影响，不静默吞掉
  if (days < FULL_YEAR_DAYS) {
    notes.push(`覆盖 ${Math.round(days)} 天（不足整年），年电量按平均功率 × 8760h 外推`)
  }
  if (intervalMin > 15) {
    notes.push(`粒度 ${intervalMin} 分钟粗于需量电表 15 分钟口径，最大需量为区间均值（偏保守）`)
  } else if (intervalMin < 15) {
    notes.push(`粒度 ${intervalMin} 分钟细于 15 分钟，最大值口径略高于 15 分钟平均需量`)
  }
  if (negativeCount > 0) {
    notes.push(`含 ${negativeCount} 个负值点（疑为光伏倒送的净负荷口径），已按原值参与平均`)
  }
  if (zeroCount / values.length > 0.05) {
    notes.push('零值占比超 5%（疑为采集缺测时段），如需精算建议补齐后重传')
  }

  return {
    ok: true,
    stats: {
      fileName,
      rows: values.length,
      intervalMin,
      hasTimestamp,
      days: Math.round(days * 10) / 10,
      avgKw: Math.round(avgKw * 10) / 10,
      maxKw: Math.round(maxKw * 10) / 10,
      loadFactor: Math.round(loadFactor * 1000) / 1000,
      annualKwh: Math.round(annualKwh),
      coveredKwh: Math.round(coveredKwh),
      notes,
    },
  }
}
