import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// ESLint 10 flat 配置（2026-08 自 eslint 8 + .eslintrc.cjs 迁移）：
//   - eslint 10 的 espree 原生支持 JSX 作用域分析——import 进来只在 JSX 里用的组件
//     不再被 no-unused-vars 误报（eslint 8/9 的已知限制，v10 修复）
//   - 组件文件（.jsx）首次纳入 lint 关口（旧 eslintrc 模式 CLI 默认只查 .js）
//   - eslint-plugin-react 已移除：其 peer 尚不支持 eslint 10，且本项目只消费过
//     jsx-runtime 预设与被关闭的 prop-types 规则，净贡献为零；Hooks 规则由
//     eslint-plugin-react-hooks 承担（与迁移前一致的两条核心规则）
//   - verify/*.cjs 为 CommonJS 回归脚本，单独按 node 环境解析
export default [
  // 构建产物、可再生验证工件与本地个人脚本（不入库）不检
  { ignores: ['dist/**', 'node_modules/**', 'verify/out/**', 'verify/shots/**', 'proxy-github.cjs'] },

  js.configs.recommended,

  // 应用源码：ESM + 浏览器环境 + JSX 组件
  {
    files: ['src/**/*.{js,jsx}', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // 回归验证脚本：CommonJS + Node 环境运行，但 page.evaluate 回调体在浏览器侧执行，
  // 引用 document/window —— 两套 globals 都注入（作者侧静态检查，运行时互不相干）
  {
    files: ['verify/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser },
    },
  },
]
