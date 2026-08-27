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
import { useProjectStore } from '../../stores/projectStore'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useAiStore } from '../../stores/aiStore'
import { useConfigStore } from '../../stores/configStore'
import { buildPrompt, generateReportStream } from '../../services/glm'
import { buildReportDraft } from '../../utils/report'
import { copyText, exportPdf } from '../../utils/export'

/**
 * 模块③ 订制方案（AI 方案生成）面板（Sprint 4：GLM-5 流式主流程）
 *
 * - 依赖联动：模块①② 完成后解锁
 * - 主流程：services/glm.js 流式生成，逐 chunk 追加渲染（打字机效果）
 * - 降级（Sprint 4 前置约束）：Key 未填或调用失败自动回退 utils/report.js 本地模板，
 *   并以 amber 提示明确告知原因，不静默失败
 * - 导出：复制（剪贴板 + 兜底）/ 导出 PDF（window.print + 打印样式，仅输出本卡）
 */
/** wide（工作模式）：满宽阅读，方案渲染区加高，尽量一页收纳 */
export default function AIReportPanel({ wide = false }) {
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)
  const isGenerating = useAiStore((s) => s.isGenerating)
  const reportContent = useAiStore((s) => s.reportContent)
  const error = useAiStore((s) => s.error)
  const apiKey = useAiStore((s) => s.apiKey)
  const baseURL = useAiStore((s) => s.baseURL)
  const modelName = useAiStore((s) => s.modelName)
  const setGenerating = useAiStore((s) => s.setGenerating)
  const setReportContent = useAiStore((s) => s.setReportContent)
  const appendReport = useAiStore((s) => s.appendReport)
  const setError = useAiStore((s) => s.setError)
  const clearReport = useAiStore((s) => s.clearReport)
  const config = useConfigStore((s) => s.config)

  const [copied, setCopied] = useState(false)
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

    // 降级路径：本地模板生成 + 明确提示原因
    const fallback = (notice) => {
      setReportContent(buildReportDraft(project, diagnosis, config))
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
      system,
      user,
      onChunk: (delta) => appendReport(delta),
      onComplete: () => setGenerating(false),
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

  return (
    <Card className="flex flex-col p-6 print:border-none print:bg-transparent">
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
        自动汇总模块①② 数据，GLM-5 流式生成一页式《综合能源节能改造方案》，支持复制与导出 PDF。
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

      {/* 依赖齐备：生成按钮（最强 CTA 反色白底 pill） */}
      {ready && !hasReport && !isGenerating && (
        <div className="no-print mt-5 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line px-4 py-8">
          <Button variant="inverse" size="lg" onClick={handleGenerate}>
            <Rocket size={18} />
            生成方案报告
          </Button>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-paper-mute">
            GLM-5 流式生成 · 未配置 Key 或调用失败时自动回退本地模板
          </p>
        </div>
      )}

      {/* 生成中 / 已生成：操作栏 + Markdown 渲染区 */}
      {(hasReport || isGenerating) && (
        <>
          <div className="no-print mt-4 flex items-center gap-2">
            {isGenerating ? (
              <>
                <span className="flex items-center gap-1.5 text-[13px] text-paper-mute">
                  <Loader2 size={14} className="animate-spin text-volt" />
                  GLM-5 生成中…
                </span>
                <Button variant="ghost" size="sm" onClick={handleStop}>
                  <Square size={12} />
                  停止
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={handleGenerate}>
                  <RefreshCw size={14} />
                  重新生成
                </Button>
                <Button variant="ghost" size="sm" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check size={14} className="text-volt" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      复制内容
                    </>
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={exportPdf}>
                  <Printer size={14} />
                  导出 PDF
                </Button>
              </>
            )}
            {!isGenerating && (
              <span className="ml-auto text-[12px] text-paper-mute">已汇总模块①② · 含当次系数快照</span>
            )}
          </div>

          {/* 降级/错误提示：amber 警示语义 */}
          {error && (
            <p className="no-print mt-2 text-[13px] leading-relaxed text-amber" role="alert">
              {error}
            </p>
          )}

          <div
            ref={scrollRef}
            className={`md mt-4 flex-1 overflow-y-auto print:max-h-none print:overflow-visible ${
              wide ? 'max-h-[600px]' : 'max-h-[520px]'
            }`}
          >
            <Markdown remarkPlugins={[remarkGfm]}>{reportContent}</Markdown>
          </div>
        </>
      )}
    </Card>
  )
}
