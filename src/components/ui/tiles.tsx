import { cn } from "@/lib/utils"

interface TilesProps {
  className?: string
  rows?: number
  cols?: number
  tileClassName?: string
  tileSize?: "sm" | "md" | "lg"
}

const tileSizes = {
  sm: "w-8 h-8",
  md: "w-9 h-9 md:w-12 md:h-12",
  lg: "w-12 h-12 md:w-16 md:h-16",
}

export function Tiles({
  className,
  rows = 100,
  cols = 10,
  tileClassName,
  tileSize = "md",
}: TilesProps) {
  return (
    <div className={cn("relative z-0 flex w-full h-full justify-center", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={`row-${i}`}
          className={cn(tileSizes[tileSize], "border-l dark:border-neutral-900 border-neutral-200 relative", tileClassName)}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={`col-${j}`}
              className={cn(
                tileSizes[tileSize],
                "border-r border-t dark:border-neutral-900 border-neutral-200 relative hover:bg-tile transition-colors",
                tileClassName
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
