import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 用相对路径，这样本地预览和 GitHub Pages（/paper-format-cleaner/ 子路径）都能直接打开
export default defineConfig({
  base: './',
  plugins: [react()],
})
