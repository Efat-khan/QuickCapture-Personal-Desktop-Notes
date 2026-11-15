import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths: the production build is loaded from file://, where "/assets/..." points at the drive root.
  base: './',
  plugins: [react()],
  // Electron waits on this exact port; fail loudly instead of silently moving to 5174.
  server: { port: 5173, strictPort: true },
})
