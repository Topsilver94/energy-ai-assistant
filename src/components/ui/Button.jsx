/**
 * 通用按钮 —— 圆角体系签名组件：一律 pill（rounded-full，CLAUDE.md §6）
 * primary：亮绿填充 + 黑字（对比度 10:1+，比白字更清晰）
 * inverse：白底黑字，最强 CTA（如「生成方案」）
 * ghost：  透明底 + mute 描边，hover 变白
 */
const VARIANTS = {
  primary: 'bg-volt text-ink hover:bg-volt-dim',
  inverse: 'bg-paper text-ink hover:bg-paper-mute',
  ghost:
    'bg-transparent text-paper-mute border border-paper-mute/40 hover:text-paper hover:border-paper',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-[13px]',
  md: 'px-5 py-2.5 text-sm',
}

export default function Button({ variant = 'primary', size = 'md', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  )
}
