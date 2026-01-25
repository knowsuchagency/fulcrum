"use client"

import * as React from "react"
import { Group, Panel, Separator, type GroupProps, type PanelProps } from "react-resizable-panels"

import { cn } from "@/lib/utils"

interface ResizablePanelGroupProps extends Omit<GroupProps, 'orientation'> {
  direction?: "horizontal" | "vertical"
}

function ResizablePanelGroup({
  className,
  direction,
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      orientation={direction}
      className={cn(
        "flex h-full w-full data-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel(props: PanelProps) {
  return <Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px items-center justify-center bg-border cursor-grab active:cursor-grabbing group touch-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        "focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "data-[orientation=vertical]:h-px data-[orientation=vertical]:w-full data-[orientation=vertical]:cursor-row-resize",
        "[&[data-orientation=vertical]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 bg-muted/90 border border-border rounded-full px-1 py-3 opacity-70 group-hover:opacity-100 group-focus:opacity-100 transition-opacity shadow-sm">
          <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground" />
          <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground" />
          <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
