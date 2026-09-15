import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Check,
  Circle,
  Copy,
  Loader2,
  Printer,
  RefreshCw,
  Rocket,
  Sparkles,
  Square,
} from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import Button from '../ui/Button'
import ReportDocument from './ReportDocument'
// 演示模式书签跳到 STEP③ 时要归零本卡的滚动容器，锚点 id 由导航契约文件统一声明
import { REPORT_SCROLL_ID } from '../layout/steps'
import { useProjectStore } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useAiStore } from '../../stores/aiStore'
import { useConfigStore } from '../../stores/configStore'
import { buildPrompt, generateReportStream } from '../../services/glm'
import { buildReportDraft } from '../../utils/report'
import { copyText, exportGuideHint, exportPdf } from '../../utils/export'

/**
 * 模块③ 订制方案（AI 方案生成）面板（Sprint 4：GLM-5 流式主流程）
 *
 * - 依赖联动：模块①② 完成后解锁
 * - 主流程：services/glm.js 流式生成，逐 chunk 追加渲染（打字机效果）
 * - 降级（Sprint 4 前置约束）：Key 未填或调用失败自动回退 utils/report.js 本地模板，
 *   并以 amber 提示明确告知原因，不静默失败
 * - 导出：复制（剪贴板 + 兜底）/ 导出 PDF（window.print + 打印样式，仅输出本卡）
 */
/**
 * 竖排图标工具钮（图标在上 / 文字在下）：STEP3 报告顶部操作条专用——手机上比横排
 * 文字钮更省横向空间、触控面更大；复制成功切换为对勾 + volt 选中态。
 */
function ToolTile({ icon: Icon, label, onClick, pressed = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-3.5 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-volt ${
        pressed
          ? 'border-volt/40 bg-volt/10 text-volt'
          : 'border-line bg-ink-raised/50 text-paper-mute hover:border-paper-mute hover:text-paper'
      }`}
    >
      <Icon size={17} strokeWidth={2.25} />
      <span className="text-[11px] leading-none">{label}</span>
    </button>
  )
}

/** wide（工作模式）：满宽阅读，方案渲染区加高，尽量一页收纳 */
export default function AIReportPanel({ wide = false }) {
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)
  const isGenerating = useAiStore((s) => s.isGenerating)
  const reportContent = useAiStore((s) => s.reportContent)
  const thinking = useAiStore((s) => s.thinking)
  const error = useAiStore((s) => s.error)
  const apiKey = useAiStore((s) => s.apiKey)
  const baseURL = useAiStore((s) => s.baseURL)
  const modelName = useAiStore((s) => s.modelName)
  const reasoningEffort = useAiStore((s) => s.reasoningEffort)
  const setGenerating = useAiStore((s) => s.setGenerating)
  const setReportContent = useAiStore((s) => s.setReportContent)
  const setGenerationSource = useAiStore((s) => s.setGenerationSource)
  const appendReport = useAiStore((s) => s.appendReport)
  const appendThinking = useAiStore((s) => s.appendThinking)
  const setError = useAiStore((s) => s.setError)
  const clearReport = useAiStore((s) => s.clearReport)
  const config = useConfigStore((s) => s.config)

  const [copied, setCopied] = useState(false)
  const [exportHint, setExportHint] = useState(false)
  const copiedTimer = useRef(null)
  const genController = useRef(null)
  const scrollRef = useRef(null)

  const ready = isFeasibleDone && isDiagnosisDone
  const hasReport = reportContent.length > 0

  // 流式期间贴底滚动（打字机可读性）
  useEffect(() => {
    if (isGenerating && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [reportContent, isGenerating])

  // 卸载时中止未完成的请求
  useEffect(() => () => genController.current?.abort(), [])

  const deps = [
    { label: 'Step 1 · 挖掘痛点', ok: isDiagnosisDone },
    { label: 'Step 2 · 锁定收益', ok: isFeasibleDone },
  ]

  // 提示拼接：上游 message 常以句号结尾（如「…请充值。」），直接接「，已回退」会叠标点，
  // 统一去尾再拼
  const joinNotice = (msg, tail) => `${msg.replace(/[.。,，;；!！?？\s]+$/, '')}，${tail}`

  const handleGenerate = () => {
    // 取三个 store 的最新快照
    const p = useProjectStore.getState()
    const d = useDiagnosisStore.getState()
    const project = { inputs: p.inputs, feasibility: p.feasibility }
    const diagnosis = { inputs: d.inputs, diagnosis: d.diagnosis }

    // 降级路径：本地模板生成 + 明确提示原因（报告头徽章标记来源）
    const fallback = (notice) => {
      setReportContent(buildReportDraft(project, diagnosis, config))
      setGenerationSource('local')
      setError(notice)
      setGenerating(false)
    }

    setError(null)
    clearReport()
    setGenerating(true)

    // Key 未填：不发起请求，直接降级（CLAUDE.md §7 三态之一）
    if (!apiKey.trim()) {
      fallback('未配置 API Key，已生成本地模板方案（可在右上角「API 设置」配置后重新生成）')
      return
    }

    const { system, user } = buildPrompt(project, diagnosis, config)
    genController.current = generateReportStream({
      apiKey,
      baseURL,
      modelName,
      reasoningEffort,
      system,
      user,
      onChunk: (delta) => appendReport(delta),
      onThinking: (delta) => appendThinking(delta),
      onComplete: () => {
        setGenerating(false)
        setGenerationSource('ai')
      },
      onError: ({ type, message }) => {
        if (type === 'aborted') {
          // 用户主动停止：已有部分内容则保留，否则降级到本地模板
          if (useAiStore.getState().reportContent) setGenerating(false)
          else fallback(joinNotice(message, '已生成本地模板方案'))
          return
        }
        fallback(joinNotice(message, '已自动回退本地模板方案'))
      },
    })
  }

  const handleStop = () => genController.current?.abort()

  const handleCopy = async () => {
    const ok = await copyText(reportContent)
    if (ok) {
      setCopied(true)
      window.clearTimeout(copiedTimer.current)
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500)
    }
  }

  // 导出 PDF：可打印环境走 window.print()；手机/内嵌 iframe 环境 print() 静默无效，
  // 触发引导提示改走系统「分享→打印→存储为 PDF」（export.js 能力检测）
  const handleExport = () => {
    exportPdf({ onUnsupported: () => setExportHint(true) })
  }

  return (
    <Card
      className={`flex flex-col p-6 print:p-0 print:border-none print:bg-transparent ${
        wide ? '' : 'h-full lg:absolute lg:inset-0 print:static'
      }`}
    >
      <div className="no-print flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-ink-raised text-volt">
            <Sparkles size={20} />
          </span>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-paper-mute">
              Step 03
            </p>
            <h3 className="text-lg font-bold">订制方案</h3>
          </div>
        </div>
        <StatusBadge done={hasReport} locked={!ready} />
      </div>

      <p className="no-print mt-4 text-sm leading-relaxed text-paper-mute">
        自动汇总模块①② 数据，{modelName || 'AI'} 流式生成一页式《综合能源节能改造方案》，支持复制与导出 PDF。
      </p>

      {/* 依赖未齐：展示数据流依赖 */}
      {!ready && (
        <div className="no-print mt-5 flex-1 rounded-lg border border-dashed border-line p-4">
          <p className="text-[11px] uppercase tracking-widest text-paper-mute">数据依赖</p>
          <div className="mt-3 space-y-2">
            {deps.map((dep) => (
              <div key={dep.label} className="flex items-center gap-2 text-[13px]">
                {dep.ok ? (
                  <Check size={14} strokeWidth={3} className="text-volt" />
                ) : (
                  <Circle size={14} className="text-paper-faint" />
                )}
                <span className={dep.ok ? 'text-paper' : 'text-paper-mute'}>{dep.label}</span>
              </div>
            ))}
            <p className="pt-1 text-[12px] text-paper-mute">
              请先完成前两步（挖掘痛点 · 锁定收益）
            </p>
          </div>
        </div>
      )}

      {/* 依赖齐备：生成按钮（最强 CTA 反色白底 pill）。
          框内**顶端对齐**而非垂直居中：演示模式卡片被拉伸到整行高（可达 2400px+），
          居中会把 CTA 推到卡片中部——从书签跳 STEP③ 时正好落在首屏之外。
          虚线框仍 flex-1 填满卡片，不留空洞 */}
      {ready && !hasReport && !isGenerating && (
        <div className="no-print mt-5 flex flex-1 flex-col items-center rounded-lg border border-dashed border-line px-4 pb-8 pt-6">
          <Button variant="inverse" size="lg" onClick={handleGenerate}>
            <Rocket size={18} />
            生成方案报告
          </Button>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-paper-mute">
            {modelName || 'AI'} 流式生成 · 未配置 Key 或调用失败时自动回退本地模板
          </p>
        </div>
      )}

      {/* 生成中 / 已生成：顶部竖排图标操作条 + 说明行 + Markdown 渲染区 */}
      {(hasReport || isGenerating) && (
        <>
          <div className="no-print mt-4 flex flex-wrap items-center gap-2">
            {isGenerating ? (
              <>
                <span className="flex items-center gap-1.5 text-[13px] text-paper-mute">
                  <Loader2 size={14} className="animate-spin text-volt" />
                  {modelName || 'AI'} 生成中…
                </span>
                <ToolTile icon={Square} label="停止" onClick={handleStop} />
              </>
            ) : (
              <>
                <ToolTile icon={RefreshCw} label="重新生成" onClick={handleGenerate} />
                <ToolTile
                  icon={copied ? Check : Copy}
                  label={copied ? '已复制' : '复制内容'}
                  pressed={copied}
                  onClick={handleCopy}
                />
                <ToolTile icon={Printer} label="导出 PDF" onClick={handleExport} />
              </>
            )}
          </div>

          {/* 说明行：按钮下方独立成行，不再与操作钮混排（打印边距 + 汇总口径） */}
          {!isGenerating && (
            <p className="no-print mt-1.5 text-[12px] leading-relaxed text-paper-mute">
              已汇总模块①② · 含当次系数快照 · 打印预览请将「边距」设为「默认」，按 A4 版心（上下 2.2cm /
              左右 2.4cm）输出
            </p>
          )}

          {/* 推理过程反馈：DeepSeek 等推理模型先思考后出正文，实时字数是「正在工作」的可感信号，避免死等 */}
          {isGenerating && !hasReport && thinking && (
            <p className="no-print mt-2 text-[12px] italic text-paper-mute">
              模型思考中…（已分析 {thinking.length} 字）
            </p>
          )}

          {/* 降级/错误提示：amber 警示语义 */}
          {error && (
            <p className="no-print mt-2 text-[13px] leading-relaxed text-amber" role="alert">
              {error}
            </p>
          )}

          {/* 导出引导：当前设备不支持 window.print() 时的分设备指引（替代「点了没反应」） */}
          {exportHint && !isGenerating && (
            <p className="no-print mt-2 text-[13px] leading-relaxed text-amber" role="alert">
              {exportGuideHint()}
            </p>
          )}

          {/* 报告版式容器：报告头/执行摘要/数据表/报告尾确定性渲染，AI 正文只进正文槽。
              wide 用 max-h 限高；演示模式（窄）Card 在 lg 起绝对定位填满三列栅格的行高
              （行高由输入侧①② 决定，报告不撑高整行），flex-1 吃满卡内剩余高度、内部
              滚动；min-h 兜底 <lg 堆叠态（Card 回文档流，无拉伸时 flex 基准为 0 会塌陷） */}
          <div
            ref={scrollRef}
            id={REPORT_SCROLL_ID}
            className={`mt-4 flex-1 overflow-y-auto print:mt-0 print:min-h-0 print:max-h-none print:overflow-visible ${
              wide ? 'max-h-[600px]' : 'min-h-[420px] lg:min-h-0'
            }`}
          >
            <ReportDocument wide={wide}>
              {reportContent ? (
                <Markdown remarkPlugins={[remarkGfm]}>{reportContent}</Markdown>
              ) : (
                <p className="text-[13px] text-paper-mute">正文生成中…</p>
              )}
            </ReportDocument>
          </div>
        </>
      )}
    </Card>
  )
}
