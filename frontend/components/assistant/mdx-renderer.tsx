import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { evaluate } from '@mdx-js/mdx'
import * as runtime from 'react/jsx-runtime'
import {
  // Chart containers
  ResponsiveContainer,
  ComposedChart,
  // Chart types
  AreaChart,
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  RadialBarChart,
  ScatterChart,
  Treemap,
  Sankey,
  FunnelChart,
  // Chart elements
  Area,
  Bar,
  Line,
  Pie,
  Radar,
  RadialBar,
  Scatter,
  Funnel,
  Cell,
  // Axes
  XAxis,
  YAxis,
  ZAxis,
  PolarAngleAxis,
  PolarRadiusAxis,
  PolarGrid,
  // Accessories
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
  ReferenceArea,
  Brush,
  Label,
  LabelList,
  // Shapes
  Rectangle,
  Curve,
  Sector,
  Cross,
  Symbols,
} from 'recharts'
import { cn } from '@/lib/utils'

// Components available in MDX scope
const mdxComponents = {
  // Chart containers
  ResponsiveContainer,
  ComposedChart,
  // Chart types
  AreaChart,
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  RadialBarChart,
  ScatterChart,
  Treemap,
  Sankey,
  FunnelChart,
  // Chart elements
  Area,
  Bar,
  Line,
  Pie,
  Radar,
  RadialBar,
  Scatter,
  Funnel,
  Cell,
  // Axes
  XAxis,
  YAxis,
  ZAxis,
  PolarAngleAxis,
  PolarRadiusAxis,
  PolarGrid,
  // Accessories
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceDot,
  ReferenceArea,
  Brush,
  Label,
  LabelList,
  // Shapes
  Rectangle,
  Curve,
  Sector,
  Cross,
  Symbols,
  // Custom wrapper for responsive charts
  ChartContainer: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={cn('w-full h-[300px]', className)}>{children}</div>
  ),
}

interface MDXRendererProps {
  source: string
  className?: string
  /** Data to inject into MDX scope */
  data?: Record<string, unknown>
}

interface MDXState {
  content: ReactNode | null
  error: string | null
  loading: boolean
}

/**
 * Renders MDX content with Recharts components available in scope.
 * Used for AI-generated charts and visualizations.
 */
// Stable empty object for default data
const EMPTY_DATA: Record<string, unknown> = {}

export function MDXRenderer({ source, className, data }: MDXRendererProps) {
  const [state, setState] = useState<MDXState>({
    content: null,
    error: null,
    loading: true,
  })

  // Use stable reference for empty data to prevent infinite re-renders
  const stableData = data ?? EMPTY_DATA

  // Memoize the scope - only changes when data actually changes
  const scope = useMemo(() => ({ ...stableData }), [stableData])

  useEffect(() => {
    let cancelled = false

    async function compile() {
      try {
        setState((s) => ({ ...s, loading: true, error: null }))

        // Debug: log the source being compiled
        console.log('MDXRenderer compiling source:', source?.slice(0, 200))

        if (!source || source.trim().length === 0) {
          throw new Error('Empty source provided to MDXRenderer')
        }

        const { default: Content } = await evaluate(source, {
          ...runtime,
          baseUrl: import.meta.url,
          useMDXComponents: () => mdxComponents,
        })

        console.log('MDX compiled successfully, Content:', typeof Content)

        if (cancelled) return

        // Render the compiled MDX with data in scope
        setState({
          content: <Content {...scope} />,
          error: null,
          loading: false,
        })
      } catch (err) {
        if (cancelled) return

        const message = err instanceof Error ? err.message : 'Failed to render chart'
        console.error('MDX compilation error:', err)
        setState({
          content: null,
          error: message,
          loading: false,
        })
      }
    }

    compile()

    return () => {
      cancelled = true
    }
  }, [source, scope])

  if (state.loading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <div className="animate-pulse text-muted-foreground text-sm">Rendering chart...</div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className={cn('p-4 bg-destructive/10 text-destructive rounded-lg text-sm', className)}>
        <p className="font-medium">Failed to render chart</p>
        <pre className="mt-2 text-xs overflow-auto max-h-32 whitespace-pre-wrap">{state.error}</pre>
      </div>
    )
  }

  // Wrap in a container with explicit height so ResponsiveContainer works
  // ResponsiveContainer requires a parent with defined width and height
  return (
    <div className={cn('mdx-chart w-full h-[350px]', className)}>
      {state.content}
    </div>
  )
}

/**
 * Extract MDX chart blocks from markdown content.
 * Looks for ```chart or ```mdx-chart code blocks.
 */
export function extractChartBlocks(content: string): { type: 'markdown' | 'chart'; content: string }[] {
  const blocks: { type: 'markdown' | 'chart'; content: string }[] = []

  // Match ```chart or ```mdx-chart blocks
  const chartPattern = /```(?:chart|mdx-chart)\s*([\s\S]*?)```/g

  let lastIndex = 0
  let match

  while ((match = chartPattern.exec(content)) !== null) {
    // Add markdown before this chart block
    if (match.index > lastIndex) {
      const markdown = content.slice(lastIndex, match.index).trim()
      if (markdown) {
        blocks.push({ type: 'markdown', content: markdown })
      }
    }

    // Add the chart block
    const chartContent = match[1].trim()
    if (chartContent) {
      blocks.push({ type: 'chart', content: chartContent })
    }
    lastIndex = match.index + match[0].length
  }

  // Add remaining markdown after last chart block
  if (lastIndex < content.length) {
    const markdown = content.slice(lastIndex).trim()
    if (markdown) {
      blocks.push({ type: 'markdown', content: markdown })
    }
  }

  return blocks
}
