import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Folder01Icon,
  FolderOpenIcon,
  DocumentCodeIcon,
  File01Icon,
  Image01Icon,
  MenuCollapseIcon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { fuzzyScore } from '@/lib/fuzzy-search'
import type { FileTreeEntry } from '@/types'

interface FileTreeProps {
  entries: FileTreeEntry[]
  selectedFile: string | null
  expandedDirs: string[]
  onSelectFile: (path: string) => void
  onToggleDir: (path: string) => void
  onCollapseAll: () => void
}

/** Flatten tree to get all file paths */
function flattenFiles(entries: FileTreeEntry[]): { name: string; path: string }[] {
  const files: { name: string; path: string }[] = []
  function traverse(nodes: FileTreeEntry[]) {
    for (const node of nodes) {
      if (node.type === 'file') {
        files.push({ name: node.name, path: node.path })
      } else if (node.children) {
        traverse(node.children)
      }
    }
  }
  traverse(entries)
  return files
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
}: FileTreeProps) {
  const { t } = useTranslation('repositories')
  const [searchQuery, setSearchQuery] = useState('')

  const allFiles = useMemo(() => flattenFiles(entries), [entries])

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.trim()
    return allFiles
      .map((file) => ({
        ...file,
        score: Math.max(fuzzyScore(file.name, query), fuzzyScore(file.path, query)),
      }))
      .filter((file) => file.score > 0)
      .sort((a, b) => b.score - a.score)
  }, [allFiles, searchQuery])

  const handleClearSearch = useCallback(() => {
    setSearchQuery('')
  }, [])

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t('detailView.fileTree.noFiles')}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--gradient-card)' }}>
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between px-2 py-1 border-b border-border bg-card">
        <span className="text-xs text-muted-foreground">{t('detailView.fileTree.title')}</span>
        <button
          onClick={onCollapseAll}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted/50"
          title={t('detailView.fileTree.collapseAll')}
        >
          <HugeiconsIcon icon={MenuCollapseIcon} size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 px-2 py-1.5 border-b border-border bg-card">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('detailView.fileTree.searchPlaceholder')}
            className="w-full text-sm bg-muted/50 border border-border rounded px-2 py-1 pr-7 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Search Results or Tree */}
      <div className="py-1 flex-1 overflow-auto">
        {filteredFiles ? (
          filteredFiles.length > 0 ? (
            filteredFiles.map((file) => (
              <div
                key={file.path}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-0.5 cursor-pointer text-sm hover:bg-muted/50',
                  selectedFile === file.path && 'bg-primary/10 text-primary'
                )}
                onClick={() => onSelectFile(file.path)}
              >
                <HugeiconsIcon
                  icon={getFileIcon(file.name)}
                  size={14}
                  strokeWidth={2}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate" title={file.path}>
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground truncate ml-auto">
                  {file.path.split('/').slice(0, -1).join('/')}
                </span>
              </div>
            ))
          ) : (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No matching files
            </div>
          )
        ) : (
          entries.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
            />
          ))
        )}
      </div>
    </div>
  )
}
