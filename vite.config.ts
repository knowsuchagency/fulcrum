import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"

const backendPort = process.env.VITE_BACKEND_PORT || '7777'

// Debug mode can be enabled via DEBUG=1 or VITE_FULCRUM_DEBUG=1
const isDebug = process.env.DEBUG === '1' || process.env.VITE_FULCRUM_DEBUG === '1'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __FULCRUM_DEBUG__: isDebug,
  },
  plugins: [TanStackRouterVite({ routesDirectory: './frontend/routes', generatedRouteTree: './frontend/routeTree.gen.ts' }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./frontend"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: {
    allowedHosts: ["citadel"],
    watch: {
      ignored: ['.fulcrum/**'],
    },
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
