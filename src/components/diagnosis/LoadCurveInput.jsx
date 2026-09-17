import { useRef, useState } from 'react'
import { FileUp, X } from 'lucide-react'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { parseLoadCurve } from '../../utils/loadCurve'

/**
 * 负荷曲线上传（模块① 既有建筑选填）：全年逐时 / 逐 15 分钟功率表 CSV/TSV，
 * 解析成功后年电量走「曲线实测口径」（电费反推让位），储能定容与需量推定改用
 * 实测最大需量——DiagnosisForm 仅对既有建筑渲染本组件。解析失败就地给 amber
 * 提示（表单无 toast，自含错误状态）；移除即回退电费/预估口径。
 */
export default function LoadCurveInput() {
  const loadCurve = useDiagnosisStore((s) => s.inputs.loadCurve)
  const setInput = useDiagnosisStore((s) => s.setInput)
  const fileRef = useRef(null)
  const [error, setError] = useState('')

  const handleFile = async (file) => {
    if (!file) return
    setError('')
    // 大文件防御：>20 MB 直接拒（全年 15 分钟曲线 CSV 通常 < 5 MB）
    if (file.size > 20 * 1024 * 1024) {
      setError('文件超过 20 MB，请确认导出的是功率曲线而非混入其他数据')
      return
    }
    try {
      const buffer = await file.arrayBuffer()
      const result = parseLoadCurve(buffer, file.name)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setInput({ loadCurve: result.stats })
    } catch {
      setError('文件读取失败，请重试或换用 CSV/TSV 导出')
    }
  }

  // 未上传：虚线上传位（label 包隐藏 input，键盘可达；点击/回车均触发选文件）
  if (!loadCurve) {
    return (
      <div>
        <label
          className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-[13px] text-paper-mute transition-colors hover:border-paper-mute hover:text-paper focus-within:ring-2 focus-within:ring-volt"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileRef.current?.click()
            }
          }}
        >
          <span className="flex min-w-0 items-center gap-2">
            <FileUp size={15} className="shrink-0" />
            <span className="truncate">上传负荷曲线（选填）</span>
          </span>
          <span className="shrink-0 font-mono text-[12px]">CSV/TSV</span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="sr-only"
            onChange={(e) => {
              handleFile(e.target.files?.[0])
              e.target.value = '' // 同名文件重传也触发 onChange
            }}
          />
        </label>
        {/* 文案里的两个格式约束是解析器的真实边界，不是提示性套话：取每行「末个可解析数值」
            为功率 ⇒ 功率后还有电压/电流列会取错；解析器不读单位 ⇒ 列里写 W 或 MW 会差 1000
            倍且照样算下去。两列式最稳，写在客户第一眼看到的地方（load-curve 守护 ⑧ 盯着） */}
        <p className="mt-1.5 text-[12px] leading-relaxed text-paper-mute">
          全年逐时 / 逐 15 分钟功率表，只留「时间 + 功率」两列（单位 kW，功率放末列最稳）：年电量转实测口径，
          储能定容与需量按曲线最大值。
        </p>
        {error && (
          <p className="mt-1 text-[12px] leading-relaxed text-amber" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

  // 已上传：摘要卡（volt 边框 = 实测口径标识）+ 移除按钮
  return (
    <div className="rounded-xl border border-volt/30 bg-ink-raised px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] text-paper">
          {loadCurve.fileName || '负荷曲线'}
        </p>
        <button
          type="button"
          onClick={() => setInput({ loadCurve: null })}
          aria-label="移除负荷曲线"
          className="rounded-full p-1 text-paper-mute transition-colors hover:text-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-volt"
        >
          <X size={13} strokeWidth={2.25} />
        </button>
      </div>
      <p className="mt-1 tabular font-mono text-[12px] leading-relaxed text-paper-mute">
        年电量 {Math.round(loadCurve.annualKwh / 1e4).toLocaleString()} 万kWh · 最大需量{' '}
        {loadCurve.maxKw.toLocaleString()} kW · 负荷率 {(loadCurve.loadFactor * 100).toFixed(0)}%
        · {loadCurve.intervalMin} 分钟 × {loadCurve.rows.toLocaleString()} 点
      </p>
      {loadCurve.notes?.length > 0 && (
        <p className="mt-1 text-[11px] leading-relaxed text-paper-mute">
          {loadCurve.notes.join('；')}
        </p>
      )}
      <p className="mt-1 text-[12px] leading-relaxed text-volt">
        曲线实测口径已启用，电费栏不再参与测算
      </p>
    </div>
  )
}
