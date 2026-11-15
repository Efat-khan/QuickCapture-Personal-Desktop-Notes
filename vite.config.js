import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Content-Security-Policy for the packaged app: only its own scripts, styles, images and
// recordings (served via qc-audio://) may load. Added to production builds only, because the
// dev server injects an inline script for hot reloading.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' qc-audio:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const contentSecurityPolicy = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
  ],
}

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths: the production build is loaded from file://, where "/assets/..." points at the drive root.
  base: './',
  plugins: [react(), contentSecurityPolicy],
  // Electron waits on this exact port; fail loudly instead of silently moving to 5174.
  server: { port: 5173, strictPort: true },
})
