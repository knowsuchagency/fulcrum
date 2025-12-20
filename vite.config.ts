import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
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
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3222',
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3222',
        changeOrigin: true,
      },
    },
  },
})
