import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 必须与 GitHub Pages 仓库名一致（energy-ai-assistant），
// 否则部署后资源 404，见 CLAUDE.md §8
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/energy-ai-assistant/',
  plugins: [react()],
}))