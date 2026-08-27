import { useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import Toast from '../ui/Toast'
import DiagnosisForm from './DiagnosisForm'
import DiagnosisResults from './DiagnosisResults'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useConfigStore } from '../../stores/configStore'
import { useProjectStore } from '../../stores/projectStore'
import { calculateDiagnosis } from '../../utils/diagnosis'

// 最短 loading 时长（UX 常数，防结果闪现，同模块②）
const MIN_LOADING_MS = 300

/**
 * 模块① 挖掘痛点（能耗诊断）：卡片外壳 + 表单 + 结果整合
 * 诊断快照附带计算时的 buildingType / year，供结果区与模块③ 稳定引用
 * wide（工作模式）：表单与结果左右双栏并排（同模块②），窄容器保持上下堆叠
 * onApplied：工作模式传入（填入推荐后跳转模块②测算页）；演示模式不传，用 toast 反馈
 */
export default function DiagnosisModule({ wide = false, onApplied }) {
  const inputs = useDiagnosisStore((s) => s.inputs)
  const isDiagnosisDone = useDiagnosisStore((s) => s.isDiagnosisDone)
  const setDiagnosis = useDiagnosisStore((s) => s.setDiagnosis)
  const config = useConfigStore((s) => s.config)
  const applyRecommendation = useProjectStore((s) => s.applyRecommendation)

  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  const showToast = (message) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2200)
  }

  const handleSubmit = () => {
    // 表单校验：面积两种性质都必须 > 0；电费仅既有建筑、设计强度仅新建建筑（可选）
    const area = Number(inputs.area)
    if (!Number.isFinite(area) || area <= 0) {
      showToast('建筑面积必须为大于 0 的数字')
      return
    }
    if (inputs.buildingNature === 'new') {
      const design = Number(inputs.designIntensity)
      if (inputs.designIntensity !== '' && !(Number.isFinite(design) && design > 0)) {
        showToast('设计能耗强度须为大于 0 的数字（留空则按约束值预估）')
        return
      }
    } else {
      const fee = Number(inputs.annualElectricityFee)
      if (!Number.isFinite(fee) || fee <= 0) {
        showToast('年度电费必须为大于 0 的数字')
        return
      }
    }
    setLoading(true)
    window.setTimeout(() => {
      const result = calculateDiagnosis(useDiagnosisStore.getState().inputs, config)
      if (!result) {
        showToast('诊断失败：请检查建筑类型')
        setLoading(false)
        return
      }
      // 快照附 area / province：推荐引擎与结果展示需要，避免表单后续编辑造成错位
      setDiagnosis({
        ...result,
        buildingType: inputs.buildingType,
        year: inputs.year,
        area: Number(inputs.area),
        province: inputs.province,
      })
      setLoading(false)
    }, MIN_LOADING_MS)
  }

  // 采纳推荐 → 覆盖式写入模块②测算（推荐列表内部已做两段式确认）。
  // 工作模式填完即跳测算页（表单已填状态即反馈）；演示模式三列同屏，用 toast 提示
  const handleApply = (recs) => {
    applyRecommendation(recs)
    if (onApplied) onApplied()
    else showToast('已填入模块②推荐组合，可调整规模后开始测算')
  }

  return (
    <Card className="no-print flex flex-col p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded bg-ink-raised text-volt">
            <Activity size={20} />
          </span>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-paper-mute">
              Step 01
            </p>
            <h3 className="text-lg font-bold">挖掘痛点</h3>
          </div>
        </div>
        <StatusBadge done={isDiagnosisDone} />
      </div>

      {/* 功能描述句置于「开始诊断」按钮之后；wide 布局下跟随左列表单列 */}
      {wide ? (
        <div className="mt-5 grid items-start gap-x-6 lg:grid-cols-2">
          <div>
            <DiagnosisForm onSubmit={handleSubmit} loading={loading} />
            <p className="mt-3 text-sm leading-relaxed text-paper-mute">
              录入建筑信息与年度电费，对标行业基准，定位节能空间。
            </p>
          </div>
          <DiagnosisResults onApply={handleApply} />
        </div>
      ) : (
        <>
          <DiagnosisForm onSubmit={handleSubmit} loading={loading} />
          <p className="mt-3 text-sm leading-relaxed text-paper-mute">
            录入建筑信息与年度电费，对标行业基准，定位节能空间。
          </p>
          <DiagnosisResults onApply={handleApply} />
        </>
      )}
      <Toast message={toast} />
    </Card>
  )
}
