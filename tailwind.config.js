/** @type {import('tailwindcss').Config} */
// 黑绿先锋设计系统（CLAUDE.md §6）：全站唯一强调色 volt 亮绿，
// 纪律：不引入第二亮色，先锋感来自黑绿对比 + pill 圆角反差
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // 背景四层：页面 → 面板 → 抬起 → 悬停
        ink: { DEFAULT: '#121212', panel: '#181818', raised: '#282828', hover: '#333333' },
        // 唯一强调色：CTA / 关键数据 / 选中态 / 图表主线
        volt: { DEFAULT: '#1ED760', dim: '#1DB954' },
        // 文字三级：正文 → 次要 → 仅禁用与装饰
        paper: { DEFAULT: '#FFFFFF', mute: '#B3B3B3', faint: '#6A6A6A' },
        // 唯一例外色：超基准预警 / 风险提示
        amber: { DEFAULT: '#F59E0B' },
        // 边框 / 分隔线，极弱融入背景
        line: '#333333',
      },
      fontFamily: {
        // 拉丁/数字标题 Montserrat，中文走系统栈不引 webfont
        sans: ['Montserrat', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
        // 数据数字（IRR/回收期/投资额/碳减排）等宽栈
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
