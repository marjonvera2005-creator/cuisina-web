import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// VITE_BASE: the folder the site is served from. "/" on this laptop; "/cuisina-web/" on GitHub Pages
// (set by .github/workflows/deploy.yml).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
