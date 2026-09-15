import { useMemo, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import Card from '../ui/Card'
import StatusBadge from '../ui/StatusBadge'
import Toast from '../ui/Toast'
import DiagnosisForm from './DiagnosisForm'
import DiagnosisResults from './DiagnosisResults'
import ValueHeatmap from './ValueHeatmap'
import { useDiagnosisStore } from '../../stores/diagnosisStore'
import { useConfigStore } from '../../stores/configStore'
import { useProjectStore } from '../../stores/projectStore'
import { calculateDiagnosis } from '../../utils/diagnosis'
import { recommendFromDiagnosis } from '../../utils/recommend'

// 最短 loading 时长（UX 常数，防结果闪现，同模块②）
const MIN_LOADING_MS = 300

/**
 * 模块① 挖掘痛点（能耗诊断）：卡片外壳 + 表单 + 结果整合
 * 诊断快照附带计算时的 buildingType / year，供结果区与模块③ 稳定引用
 * wide（工作模式）：表单与结果左右双栏并排（同模块②），窄容器保持上下堆叠
 * onApplied：工作模式传入（填入推荐后跳转模块②测算页）；演示模式不传，用 toast 反馈
 * 推荐引擎在本容器派生一次：热力图与结果区共用——wide 时热力图放左列表单下方，
 * 平衡双栏高度、减少整页下滑；窄容器保持「结果在前、热力图殿后」的原顺序
 */
export default function DiagnosisModule({ wide = false, onApplied }) {
  const inputs = useDiagnosisStore((s) => s.inputs)
  const diagnosis = useDiagnosisStore((s) => s.diagnosis)
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
      if (inputs.annualElectricityFee !== '' && !(Number.isFinite(fee) && fee > 0)) {
        showToast('电费须为大于 0 的数字（留空则按预估口径兜底）')
        return
      }
      const trafo = Number(inputs.transformerKva)
      if (inputs.transformerKva !== '' && !(Number.isFinite(trafo) && trafo > 0)) {
        showToast('变压器容量须为大于 0 的数字（留空则按类型指标推定）')
        return
      }
    }
    const spots = Number(inputs.parkingSpots)
    if (inputs.parkingSpots !== '' && !(Number.isFinite(spots) && spots > 0)) {
      showToast('车位数量须为大于 0 的数字（留空则按类型配建水平推定）')
      return
    }
    const roof = Number(inputs.roofArea)
    if (inputs.roofArea !== '' && !(Number.isFinite(roof) && roof > 0)) {
      showToast('屋面面积须为大于 0 的数字（留空则按类型系数推定）')
      return
    }
    setLoading(true)
    window.setTimeout(() => {
      const result = calculateDiagnosis(useDiagnosisStore.getState().inputs, config)
      if (!result) {
        showToast('诊断失败：请检查建筑类型')
        setLoading(false)
        return
      }
      // 快照附 area / province / roofType / roofArea / transformerKva / parkingSpots：推荐引擎与结果展示
      // 需要，避免表单后续编辑造成错位
      setDiagnosis({
        ...result,
        buildingType: inputs.buildingType,
        year: inputs.year,
        area: Number(inputs.area),
        province: inputs.province,
        roofType: inputs.roofType,
        roofArea: inputs.roofArea,
        transformerKva: inputs.transformerKva,
        parkingSpots: inputs.parkingSpots,
      })
      setLoading(false)
    }, MIN_LOADING_MS)
  }

  // 采纳推荐 → 单击覆盖式写入模块②测算。
  // 工作模式填完即跳测算页（表单已填状态即反馈）；演示模式三列同屏，用 toast 提示。
  // 省份随推荐一并携带：①② 是同一项目的两段（先诊断后开方），电价/利用小时/峰谷价差
  // 都按省取数——两个模块各持一个省份，等于把同一个项目算成两个地方
  const handleApply = (recs) => {
    applyRecommendation(recs, diagnosis?.province)
    if (onApplied) onApplied()
    else showToast('已填入模块②推荐组合，可调整规模后开始测算')
  }

  // 推荐引擎：从诊断快照确定性派生（config 变化随诊断重算一并刷新，与结果区同源）。
  // 快照→入参的映射集中在 recommendFromDiagnosis，模块② 方案比选复用同一入口——
  // 两处逐字同源，避免各写一份映射后悄悄漂移
  const recs = useMemo(() => recommendFromDiagnosis(diagnosis, config), [diagnosis, config])

  return (
    <Card className={`no-print flex flex-col p-6 ${wide ? '' : 'h-full'}`}>
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

      {/* 功能描述句置于「开始诊断」按钮之后；wide 布局下跟随左列表单列。
          双栏齐平：左列 flex + 热力图 mt-auto 贴底；pb-5 抵消右列底部「填入模块②」
          按钮行（mt-3 12px + 按钮 32px ≈ 44px − 表下说明句 24px），使热力图表格底端
          对齐右列最后一张推荐卡的底端（而非按钮行）；偏差由 verify/heatmap-layout.cjs 守护 */}
      {wide ? (
        <div className="mt-5 grid gap-x-6 lg:grid-cols-2">
          <div className="flex flex-col">
            <DiagnosisForm onSubmit={handleSubmit} loading={loading} />
            <p className="mt-3 text-sm leading-relaxed text-paper-mute">
              录入建筑信息与年度电费，对标行业基准，定位节能空间。
            </p>
            <div className="mt-auto pt-6 pb-5">
              <ValueHeatmap recs={recs} />
            </div>
          </div>
          <DiagnosisResults recs={recs} onApply={handleApply} />
        </div>
      ) : (
        <>
          <DiagnosisForm onSubmit={handleSubmit} loading={loading} />
          <p className="mt-3 text-sm leading-relaxed text-paper-mute">
            录入建筑信息与年度电费，对标行业基准，定位节能空间。
          </p>
          <DiagnosisResults recs={recs} onApply={handleApply} />
          <ValueHeatmap recs={recs} />
        </>
      )}
      <Toast message={toast} />
    </Card>
  )
}
