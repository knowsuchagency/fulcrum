import { useEffect, useRef } from 'react'
import embed, { type VisualizationSpec } from 'vega-embed'

interface VegaChartProps {
  spec: VisualizationSpec
  className?: string
}

export function VegaChart({ spec, className }: VegaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const embedChart = async () => {
      try {
        await embed(containerRef.current!, spec, {
          actions: false,
          theme: 'dark',
        })
      } catch (error) {
        console.error('Failed to render Vega chart:', error)
      }
    }

    embedChart()
  }, [spec])

  return <div ref={containerRef} className={className} />
}
