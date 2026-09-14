import { useRef, useState } from 'react'
import { Calculator } from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import Toast from '../ui/Toast'
import FeasibilityForm from './FeasibilityForm'
import FeasibilityResults from './FeasibilityResults'
import { PROJECT_TYPES, useProjectStore } from '../../stores/projectStore'
import { useConfigStore } from '../../stores/configStore'
import { calculateFeasibility } from '../../utils/finance'

// 测算按钮最短 loading 时长：防止结果闪现造成「没点到」的错觉（UX 常数，非计算系数）
const MIN_LOADING_MS = 300

/**
 * 模块② 锁定收益（可行性速算）：卡片外壳 + 表单 + 结果整合
 * 状态流：多选系统与规模 → projectStore.inputs.systems；
 * 测算 → calculateFeasibility → setFeasibility（isFeasibleDone 置 true，
 * 底部进度条与模块③依赖随之点亮）
 * wide（工作模式）：表单与结果左右双栏并排，把纵向高度压进横向空间，
 * 满足「一页之内尽量不下滑」；窄容器（演示模式三列）保持上下堆叠。
 */
export default function CalculatorModule({ wide = false }) {
  const inputs = useProjectStore((s) => s.inputs)
  const isFeasibleDone = useProjectStore((s) => s.isFeasibleDone)
  const setFeasibility = useProjectStore((s) => s.setFeasibility)
  const config = useConfigStore((s) => s.config)

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const showToast = (message) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }

  const handleSubmit = () => {
    // 表单校验①：至少选择一个系统
    const enabledKeys = Object.keys(inputs.systems).filter((k) => inputs.systems[k].enabled)
    if (enabledKeys.length === 0) {
      showToast('请至少选择一个系统')
      return
    }
    // 表单校验②：每个选中系统的规模必须是大于 0 的数字
    const invalid = enabledKeys.filter((k) => !(Number(inputs.systems[k].capacity) > 0))
    if (invalid.length > 0) {
      const labels = invalid
        .map((k) => PROJECT_TYPES.find((t) => t.key === k)?.label ?? k)
        .join('、')
      showToast(`所选系统规模必须为大于 0 的数字：${labels}`)
      return
    }

    setLoading(true)
    window.setTimeout(() => {
      // 始终取 configStore 最新系数 + projectStore 最新输入；
      // calculateFeasibility 对入参形状不符会 throw（fail-fast），此处兜住给明确提示
      try {
        const result = calculateFeasibility(useProjectStore.getState().inputs, config)
        if (!result) {
          showToast('测算失败：未找到可测算项')
          setLoading(false)
          return
        }
        setFeasibility(result)
      } catch (err) {
        showToast(`测算失败：${err.message}`)
      }
      setLoading(false)
    }, MIN_LOADING_MS)
  }

  return (
    <Card className={`no-print flex flex-col p-6 ${wide ? '' : 'h-full'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-ink-raised text-volt">
            <Calculator size={20} />
          </span>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-paper-mute">
              Step 02
            </p>
            <h3 className="text-lg font-bold">锁定收益</h3>
          </div>
        </div>
        <StatusBadge done={isFeasibleDone} />
      </div>

      {/* 功能描述句置于「开始测算」按钮之后；wide 布局下跟随左列表单列 */}
      {wide ? (
        <div className="mt-5 grid min-w-0 items-start gap-x-6 lg:grid-cols-2">
          <div className="min-w-0">
            <FeasibilityForm onSubmit={handleSubmit} loading={loading} />
            <p className="mt-3 text-sm leading-relaxed text-paper-mute">
              勾选系统组合、填规模与省份，即时估算组合投资与收益。
            </p>
          </div>
          <div className="min-w-0">
            <FeasibilityResults />
          </div>
        </div>
      ) : (
        <>
          <FeasibilityForm onSubmit={handleSubmit} loading={loading} />
          <p className="mt-3 text-sm leading-relaxed text-paper-mute">
            勾选系统组合、填规模与省份，即时估算组合投资与收益。
          </p>
          <FeasibilityResults />
        </>
      )}
      <Toast message={toast} />
    </Card>
  )
}
