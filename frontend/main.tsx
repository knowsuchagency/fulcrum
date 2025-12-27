import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'

import { routeTree } from './routeTree.gen'
import { AuthProvider } from './contexts/auth-context'
import { LoginModal } from './components/login-modal'
import { StoreProvider } from './stores'
import './i18n' // Initialize i18n before rendering
import './index.css'

// Apply zoom from query parameter (for desktop app)
// This sets the root font-size so all rem-based UI scales natively
const urlParams = new URLSearchParams(window.location.search)
const zoom = parseFloat(urlParams.get('zoom') || '1')
if (zoom !== 1 && zoom >= 0.5 && zoom <= 2.0) {
  document.documentElement.style.fontSize = `${16 * zoom}px`
}

// Export zoom level for components that need pixel-based scaling (e.g., xterm.js)
export const desktopZoom = zoom >= 0.5 && zoom <= 2.0 ? zoom : 1

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <StoreProvider>
          <AuthProvider>
            <RouterProvider router={router} />
            <LoginModal />
          </AuthProvider>
        </StoreProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
)
