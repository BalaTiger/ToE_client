import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 关键：base 设为仓库名（如果仓库名是 jsx-github-pages，就写这个）
  base: '/' 
})