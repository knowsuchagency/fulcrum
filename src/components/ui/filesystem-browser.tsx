import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Folder01Icon,
  FolderOpenIcon,
  ArrowUp01Icon,
  Home01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useDirectoryListing } from '@/hooks/use-filesystem'

interface FilesystemBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (path: string) => void
  initialPath?: string
}

export function FilesystemBrowser({
  open,
  onOpenChange,
  onSelect,
  initialPath,
}: FilesystemBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(
    initialPath || null
  )
  const [manualPath, setManualPath] = useState('')
  const [filter, setFilter] = useState('')

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentPath(initialPath || null)
      setManualPath('')
      setFilter('')
    }
  }, [open, initialPath])

  const { data, isLoading, error } = useDirectoryListing(
    open ? (currentPath ?? '') : null
  )

  // Check if current directory is a git repo
  const currentIsGitRepo = data?.entries.some(
    (e) => e.name === '.git' || (data.path && data.entries.length === 0)
  )

  const handleNavigate = (name: string) => {
    if (data) {
      setCurrentPath(data.path + '/' + name)
      setFilter('')
    }
  }

  const handleParent = () => {
    if (data?.parent && data.parent !== data.path) {
      setCurrentPath(data.parent)
      setFilter('')
    }
  }

  const handleHome = () => {
    setCurrentPath(null)
    setFilter('')
  }

  const handleManualGo = () => {
    if (manualPath.trim()) {
      setCurrentPath(manualPath.trim())
      setFilter('')
    }
  }

  const handleSelect = (path: string) => {
    onSelect(path)
    onOpenChange(false)
  }

  // Filter entries based on search
  const filteredEntries = data?.entries.filter((entry) =>
    entry.name.toLowerCase().includes(filter.toLowerCase())
  )

  // Check if current path is a git repo (has .git folder detected by backend)
  const isCurrentGitRepo =
    data?.entries.some((e) => e.name === '.git') ||
    filteredEntries?.some((e) => e.isGitRepo && e.name === '.')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select Git Repository</DialogTitle>
          <DialogDescription>
            Choose an existing git repository
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Click folder names to navigate • Use action buttons to select
        </p>

        <Separator />

        {/* Manual path input */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Enter path manually:</label>
          <div className="flex gap-2">
            <Input
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="/path/to/your/project"
              onKeyDown={(e) => e.key === 'Enter' && handleManualGo()}
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={handleManualGo}>
              Go
            </Button>
          </div>
        </div>

        {/* Search filter */}
        <div className="space-y-1">
          <label className="text-xs font-medium">Search current directory:</label>
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={2}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter folders and files..."
              className="pl-8"
            />
          </div>
        </div>

        {/* Navigation bar */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleHome}
            title="Home"
          >
            <HugeiconsIcon icon={Home01Icon} size={14} strokeWidth={2} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleParent}
            disabled={!data || data.parent === data.path}
            title="Parent directory"
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={14} strokeWidth={2} />
          </Button>
          <code className="flex-1 text-xs bg-muted/50 px-2 py-1 rounded truncate">
            {data?.path || '~'}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => data && handleSelect(data.path)}
            disabled={!data}
          >
            Select Current
          </Button>
        </div>

        {/* Directory listing */}
        <ScrollArea className="h-64 border rounded-md">
          <div className="p-1">
            {isLoading && (
              <div className="text-muted-foreground text-xs p-3">Loading...</div>
            )}
            {error && (
              <div className="text-destructive text-xs p-3">{error.message}</div>
            )}
            {data && filteredEntries && (
              <>
                {filteredEntries.length === 0 && (
                  <div className="text-muted-foreground text-xs p-3">
                    {filter ? 'No matches found' : 'Empty directory'}
                  </div>
                )}

                {filteredEntries.map((entry) => (
                  <div
                    key={entry.name}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted group"
                  >
                    {entry.type === 'directory' ? (
                      <>
                        <HugeiconsIcon
                          icon={entry.isGitRepo ? FolderOpenIcon : Folder01Icon}
                          size={16}
                          strokeWidth={2}
                          className={
                            entry.isGitRepo
                              ? 'text-emerald-500'
                              : 'text-blue-500'
                          }
                        />
                        <button
                          onClick={() => handleNavigate(entry.name)}
                          className="flex-1 text-left text-xs truncate hover:underline"
                        >
                          {entry.name}
                        </button>
                        {entry.isGitRepo && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/50 text-emerald-500 font-medium">
                            git repo
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="w-4" />
                        <span className="flex-1 text-xs text-muted-foreground truncate">
                          {entry.name}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            onClick={() => data && handleSelect(data.path)}
            disabled={!data}
          >
            Select Path
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
