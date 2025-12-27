import { useCallback } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Folder01Icon,
  FolderOpenIcon,
  DocumentCodeIcon,
  File01Icon,
  Image01Icon,
  MenuCollapseIcon,
  SidebarRight01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import type { FileTreeEntry } from '@/types'

interface FileTreeProps {
  entries: FileTreeEntry[]
  selectedFile: string | null
  expandedDirs: string[]
  onSelectFile: (path: string) => void
  onToggleDir: (path: string) => void
  onCollapseAll: () => void
  onCollapsePanel?: () => void
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''

  // Image extensions
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) {
    return Image01Icon
  }

  // Code extensions
  if (
    [
      'ts',
      'tsx',
      'js',
      'jsx',
      'json',
      'css',
      'html',
      'md',
      'yaml',
      'yml',
      'toml',
      'sh',
      'py',
      'rs',
      'go',
      'sql',
    ].includes(ext)
  ) {
    return DocumentCodeIcon
  }

  return File01Icon
}

interface TreeNodeProps {
  entry: FileTreeEntry
  depth: number
  selectedFile: string | null
  expandedDirs: string[]
  onSelectFile: (path: string) => void
  onToggleDir: (path: string) => void
}

function TreeNode({
  entry,
  depth,
  selectedFile,
  expandedDirs,
  onSelectFile,
  onToggleDir,
}: TreeNodeProps) {
  const isExpanded = expandedDirs.includes(entry.path)
  const isSelected = selectedFile === entry.path
  const isDirectory = entry.type === 'directory'

  const handleClick = useCallback(() => {
    if (isDirectory) {
      onToggleDir(entry.path)
    } else {
      onSelectFile(entry.path)
    }
  }, [isDirectory, entry.path, onSelectFile, onToggleDir])

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-0.5 cursor-pointer text-sm hover:bg-muted/50',
          isSelected && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleClick}
      >
        <HugeiconsIcon
          icon={
            isDirectory
              ? isExpanded
                ? FolderOpenIcon
                : Folder01Icon
              : getFileIcon(entry.name)
          }
          size={14}
          strokeWidth={2}
          className={cn(
            'shrink-0',
            isDirectory ? 'text-accent' : 'text-muted-foreground'
          )}
        />
        <span className="break-all">{entry.name}</span>
      </div>

      {isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FileTree({
  entries,
  selectedFile,
  expandedDirs,
  onSelectFile,
  onToggleDir,
  onCollapseAll,
  onCollapsePanel,
}: FileTreeProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No files
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-2 py-1 border-b border-border bg-card">
        <span className="text-xs text-muted-foreground">Files</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onCollapseAll}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
            title="Collapse all folders"
          >
            <HugeiconsIcon icon={MenuCollapseIcon} size={14} strokeWidth={2} />
          </button>
          {onCollapsePanel && (
            <button
              onClick={onCollapsePanel}
              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
              title="Hide file tree"
            >
              <HugeiconsIcon icon={SidebarRight01Icon} size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Tree */}
      <div className="py-1 flex-1 overflow-auto">
        {entries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            selectedFile={selectedFile}
            expandedDirs={expandedDirs}
            onSelectFile={onSelectFile}
            onToggleDir={onToggleDir}
          />
        ))}
      </div>
    </div>
  )
}
