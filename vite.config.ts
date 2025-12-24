import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"

const backendPort = process.env.VITE_BACKEND_PORT || '3333'

// Debug mode can be enabled via DEBUG=1 or VITE_VIBORA_DEBUG=1
const isDebug = process.env.DEBUG === '1' || process.env.VITE_VIBORA_DEBUG === '1'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __VIBORA_DEBUG__: isDebug,
  },
  plugins: [TanStackRouterVite(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    allowedHosts: ["citadel"],
    proxy: {
      '/api': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${backendPort}`,
        ws: true,
      },
      '/health': {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
})
