import { useEffect, useState } from 'react'
import { Code2 } from 'lucide-react'

type Theme = 'light' | 'dark'

function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check URL parameter first
    const params = new URLSearchParams(window.location.search)
    const urlTheme = params.get('theme')
    if (urlTheme === 'light' || urlTheme === 'dark') {
      return urlTheme
    }
    // Fall back to system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  // Listen for theme changes from parent
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'theme' && (event.data.theme === 'light' || event.data.theme === 'dark')) {
        setTheme(event.data.theme)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme)
  }, [theme])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center text-muted-foreground">
        <Code2 className="size-16 mx-auto mb-4 opacity-20" />
        <h1 className="text-lg font-medium mb-1">Assistant Canvas</h1>
        <p className="text-sm opacity-60">
          Ask the assistant to create something
        </p>
      </div>
    </div>
  )
}

export default App
