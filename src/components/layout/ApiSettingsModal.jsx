import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import Button from '../ui/Button'
import { useAiStore } from '../../stores/aiStore'

const inputClass =
  'w-full rounded-xl bg-ink-raised px-3 py-2.5 text-[15px] text-paper outline-none transition-shadow placeholder:text-paper-faint focus:ring-2 focus:ring-volt'

/**
 * API 设置弹窗（居中小 Modal，与专家参数抽屉区分）
 *
 * 红线：Key 仅写入 aiStore 内存 state，刷新即清空，绝不持久化；
 * 「测试连接」用最小 chat 请求实测（HEAD 对 OpenAI 兼容接口拿不到鉴权结论），
 * 结果只回显到界面，不打 console。
 */
export default function ApiSettingsModal({ open, onClose }) {
  const apiKey = useAiStore((s) => s.apiKey)
  const baseURL = useAiStore((s) => s.baseURL)
  const modelName = useAiStore((s) => s.modelName)
  const reasoningEffort = useAiStore((s) => s.reasoningEffort)
  const setApiKey = useAiStore((s) => s.setApiKey)
  const setBaseURL = useAiStore((s) => s.setBaseURL)
  const setModelName = useAiStore((s) => s.setModelName)
  const setReasoningEffort = useAiStore((s) => s.setReasoningEffort)

  const [draft, setDraft] = useState({ apiKey, baseURL, modelName, reasoningEffort })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // 每次打开同步已保存配置；Esc 关闭；打开期间锁背景滚动
  useEffect(() => {
    if (open) {
      setDraft({ apiKey, baseURL, modelName, reasoningEffort })
      setTestResult(null)
    }
  }, [open, apiKey, baseURL, modelName, reasoningEffort])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const handleTest = async () => {
    if (!draft.apiKey) return
    setTesting(true)
    setTestResult(null)
    try {
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 8000)
      const res = await fetch(draft.baseURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${draft.apiKey}`,
        },
        body: JSON.stringify({
          model: draft.modelName,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: controller.signal,
      })
      window.clearTimeout(timer)
      if (res.ok) setTestResult({ ok: true, message: '连接成功，Key 有效' })
      else if (res.status === 401) setTestResult({ ok: false, message: 'Key 无效（401），请检查后重试' })
      else {
        // 解析错误体回显真实原因（如 429 余额不足），避免把用户引向「检查地址」的错误排查方向
        let detail = ''
        try {
          detail = (await res.json())?.error?.message ?? ''
        } catch {
          /* 非 JSON 错误体，保持空 */
        }
        setTestResult({
          ok: false,
          message: `接口返回 ${res.status}${detail ? `：${detail}` : '，请检查地址与模型名'}`,
        })
      }
    } catch {
      setTestResult({ ok: false, message: '网络请求失败（可能为跨域限制或网络不通）' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    setApiKey(draft.apiKey.trim())
    setBaseURL(draft.baseURL.trim())
    setModelName(draft.modelName.trim() || 'glm-5')
    setReasoningEffort(draft.reasoningEffort)
    onClose()
  }

  return (
    <div
      className={`no-print fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-200 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="API 设置"
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-md rounded-lg border border-line bg-ink-panel p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">API 设置</h3>
            <p className="mt-0.5 text-[12px] text-paper-mute">
              Key 仅保存在当前页面内存，刷新即清空，不会写入任何存储
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-2 text-paper-mute transition-colors hover:bg-ink-raised hover:text-paper"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-paper-mute">API Key</span>
            {/* 独立大输入框用 pill（CLAUDE.md §6 圆角体系） */}
            <input
              type="password"
              placeholder="sk-..."
              autoComplete="off"
              value={draft.apiKey}
              onChange={(e) => setDraft((d) => ({ ...d, apiKey: e.target.value }))}
              className="w-full rounded-full bg-ink-raised px-4 py-2.5 font-mono text-[14px] text-paper outline-none transition-shadow placeholder:text-paper-faint focus:ring-2 focus:ring-volt"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] text-paper-mute">接口地址（Base URL）</span>
            <input
              type="text"
              value={draft.baseURL}
              onChange={(e) => setDraft((d) => ({ ...d, baseURL: e.target.value }))}
              className={`${inputClass} font-mono text-[13px]`}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] text-paper-mute">模型名</span>
            <input
              type="text"
              value={draft.modelName}
              onChange={(e) => setDraft((d) => ({ ...d, modelName: e.target.value }))}
              className={`${inputClass} font-mono text-[13px]`}
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[13px] text-paper-mute">推理强度</span>
            <div className="flex rounded-xl bg-ink-raised p-1">
              {[
                { v: '', label: '不指定' },
                { v: 'low', label: '低延迟' },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, reasoningEffort: o.v }))}
                  className={`flex-1 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                    draft.reasoningEffort === o.v
                      ? 'bg-volt font-semibold text-ink'
                      : 'text-paper-mute hover:text-paper'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-paper-mute">
              DeepSeek 等推理模型选「低延迟」（首段正文约 5 秒）；GLM 等直出模型保持「不指定」。
            </p>
          </div>
        </div>

        {testResult && (
          <p
            className={`mt-3 text-[13px] ${testResult.ok ? 'text-volt' : 'text-amber'}`}
            role="status"
          >
            {testResult.message}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing || !draft.apiKey}>
            {testing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                测试中…
              </>
            ) : (
              '测试连接'
            )}
          </Button>
          <Button onClick={handleSave}>保存</Button>
        </div>
      </div>
    </div>
  )
}
