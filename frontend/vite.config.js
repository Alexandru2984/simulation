import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8094',
      '/ws':  { target: 'ws://127.0.0.1:8094', ws: true },
    },
  },
})
