import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    allowedHosts: true,
    proxy: {
      '/suppliers':        'http://localhost:3002',
      '/employees':        'http://localhost:3002',
      '/stage1':           'http://localhost:3002',
      '/stage2':           'http://localhost:3002',
      '/photos':           'http://localhost:3002',
      '/dashboard':        'http://localhost:3002',
      '/health':           'http://localhost:3002',
    },
  },
})
