import { cn } from "@/lib/utils"

interface GrainProps {
  className?: string
}

export function Grain({ className }: GrainProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-0 opacity-[0.15] dark:opacity-[0.20]",
        "[background-image:url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")]",
        className
      )}
      aria-hidden="true"
    />
  )
}
