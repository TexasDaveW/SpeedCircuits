import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/** Project site: https://texasdavew.github.io/SpeedCircuits/ */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return {
    plugins: [react()],
    base: env.GITHUB_PAGES === 'true' ? '/SpeedCircuits/' : '/',
  }
})
