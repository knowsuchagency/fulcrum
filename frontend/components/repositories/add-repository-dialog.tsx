import { useState, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Folder01Icon,
  Alert02Icon,
  Link01Icon,
  CheckmarkCircle02Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useDefaultGitReposDir } from '@/hooks/use-config'
import {
  useCreateRepository,
  useCloneRepository,
  useScanRepositories,
  useBulkCreateRepositories,
  type ScannedRepository,
} from '@/hooks/use-repositories'

/**
 * Check if a string looks like a git URL
 */
function isGitUrl(source: string): boolean {
  return (
    source.startsWith('git@') ||
    source.startsWith('https://') ||
    source.startsWith('http://') ||
    source.startsWith('gh:') ||
    source.startsWith('gl:') ||
    source.startsWith('bb:')
  )
}

/**
 * Extract repository name from a git URL
 */
function extractRepoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '')

  if (cleaned.startsWith('git@')) {
    const match = cleaned.match(/:([^/]+\/)?([^/]+)$/)
    if (match) return match[2]
  } else if (
    cleaned.startsWith('gh:') ||
    cleaned.startsWith('gl:') ||
    cleaned.startsWith('bb:')
  ) {
    const parts = cleaned.split('/')
    if (parts.length > 0) return parts[parts.length - 1]
  } else {
    const parts = cleaned.split('/')
    if (parts.length > 0) return parts[parts.length - 1]
  }

  return cleaned
}

interface AddRepositoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (repoId: string) => void
  initialTab?: 'add' | 'scan'
}

export function AddRepositoryDialog({
  open,
  onOpenChange,
  onSuccess,
  initialTab = 'add',
}: AddRepositoryDialogProps) {
  const { t } = useTranslation('repositories')

  // Tab state
  const [activeTab, setActiveTab] = useState<string>(initialTab)

  // Add tab state
  const [input, setInput] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [folderName, setFolderName] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [inputBrowserOpen, setInputBrowserOpen] = useState(false)
  const [targetDirBrowserOpen, setTargetDirBrowserOpen] = useState(false)

  // Scan tab state
  const [scanDirectory, setScanDirectory] = useState('')
  const [scannedRepos, setScannedRepos] = useState<ScannedRepository[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanBrowserOpen, setScanBrowserOpen] = useState(false)

  const { data: defaultGitReposDir } = useDefaultGitReposDir()
  const createRepository = useCreateRepository()
  const cloneRepository = useCloneRepository()
  const scanMutation = useScanRepositories()
  const bulkCreateMutation = useBulkCreateRepositories()

  // Add tab computed values
  const isUrl = useMemo(() => isGitUrl(input.trim()), [input])
  const extractedRepoName = useMemo(
    () => (isUrl ? extractRepoNameFromUrl(input.trim()) : null),
    [input, isUrl]
  )

  // Update folderName when URL changes (if user hasn't customized it)
  useEffect(() => {
    if (extractedRepoName && !folderName) {
      setFolderName(extractedRepoName)
    }
  }, [extractedRepoName, folderName])

  // Effective target directory (use default if not specified)
  const effectiveTargetDir = targetDir.trim() || defaultGitReposDir || ''

  // Compute the full clone path for preview
  const clonePath = useMemo(() => {
    if (!isUrl || !effectiveTargetDir) return null
    const name = folderName.trim() || extractedRepoName || ''
    if (!name) return null
    // Handle tilde for display
    const displayDir = effectiveTargetDir
    return `${displayDir}/${name}`
  }, [isUrl, effectiveTargetDir, folderName, extractedRepoName])

  // Scan tab computed values
  const effectiveScanDirectory = scanDirectory.trim() || defaultGitReposDir || ''
  const addableRepos = useMemo(
    () => scannedRepos?.filter((r) => !r.exists) ?? [],
    [scannedRepos]
  )

  const isAddPending = createRepository.isPending || cloneRepository.isPending
  const isScanPending = scanMutation.isPending || bulkCreateMutation.isPending

  // Add tab handlers
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)

    const value = input.trim()
    if (!value) return

    if (isUrl) {
      // Clone from URL with optional custom target dir and folder name
      const effectiveFolderName = folderName.trim() || undefined
      const effectiveDir = targetDir.trim() || undefined

      cloneRepository.mutate(
        {
          url: value,
          targetDir: effectiveDir,
          folderName: effectiveFolderName,
        },
        {
          onSuccess: (repo) => {
            resetAddState()
            onOpenChange(false)
            onSuccess?.(repo.id)
          },
          onError: (err) => {
            setAddError(err instanceof Error ? err.message : t('addModal.cloneFailed'))
          },
        }
      )
    } else {
      // Local path - use existing create
      const displayName = value.split('/').pop() || 'repo'
      createRepository.mutate(
        { path: value, displayName },
        {
          onSuccess: (repo) => {
            resetAddState()
            onOpenChange(false)
            onSuccess?.(repo.id)
          },
          onError: (err) => {
            setAddError(err instanceof Error ? err.message : t('addModal.createFailed'))
          },
        }
      )
    }
  }

  const handleInputBrowseSelect = (path: string) => {
    setInput(path)
    setInputBrowserOpen(false)
  }

  const handleTargetDirBrowseSelect = (path: string) => {
    setTargetDir(path)
    setTargetDirBrowserOpen(false)
  }

  // Scan tab handlers
  const handleScan = () => {
    setScanError(null)
    setScannedRepos(null)
    setSelected(new Set())

    scanMutation.mutate(effectiveScanDirectory || undefined, {
      onSuccess: (result) => {
        setScannedRepos(result.repositories)
        // Pre-select all addable repos
        const addable = result.repositories.filter((r) => !r.exists)
        setSelected(new Set(addable.map((r) => r.path)))
      },
      onError: (err) => {
        setScanError(err instanceof Error ? err.message : t('bulkAdd.scanFailed'))
      },
    })
  }

  const handleScanBrowseSelect = (path: string) => {
    setScanDirectory(path)
    setScanBrowserOpen(false)
    // Reset scan results when directory changes
    setScannedRepos(null)
    setSelected(new Set())
  }

  const handleToggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setSelected(new Set(addableRepos.map((r) => r.path)))
  }

  const handleSelectNone = () => {
    setSelected(new Set())
  }

  const handleBulkAdd = () => {
    if (selected.size === 0) return

    const repos = Array.from(selected).map((path) => {
      const repo = scannedRepos?.find((r) => r.path === path)
      return { path, displayName: repo?.name }
    })

    bulkCreateMutation.mutate(repos, {
      onSuccess: () => {
        resetScanState()
        onOpenChange(false)
        onSuccess?.('')
      },
      onError: (err) => {
        setScanError(err instanceof Error ? err.message : t('bulkAdd.addFailed'))
      },
    })
  }

  // Reset functions
  const resetAddState = () => {
    setInput('')
    setTargetDir('')
    setFolderName('')
    setAddError(null)
  }

  const resetScanState = () => {
    setScanDirectory('')
    setScannedRepos(null)
    setSelected(new Set())
    setScanError(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetAddState()
      resetScanState()
      setActiveTab(initialTab)
    }
    onOpenChange(nextOpen)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('addModal.title')}</DialogTitle>
            <DialogDescription>{t('addModal.description')}</DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="add" className="flex-1">
                {t('addModal.tabs.add')}
              </TabsTrigger>
              <TabsTrigger value="scan" className="flex-1">
                {t('addModal.tabs.scan')}
              </TabsTrigger>
            </TabsList>

            {/* Add Tab */}
            <TabsContent value="add">
              <form onSubmit={handleAddSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('addModal.inputLabel')}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value)
                          setAddError(null)
                          // Reset folder name when input changes to allow re-extraction
                          if (!isGitUrl(e.target.value.trim())) {
                            setFolderName('')
                          }
                        }}
                        placeholder={t('addModal.inputPlaceholder')}
                        disabled={isAddPending}
                        className="pr-8"
                      />
                      {input && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <HugeiconsIcon
                            icon={isUrl ? Link01Icon : Folder01Icon}
                            size={14}
                            strokeWidth={2}
                            className="text-muted-foreground"
                          />
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setInputBrowserOpen(true)}
                      disabled={isAddPending}
                    >
                      {t('addModal.browse')}
                    </Button>
                  </div>
                </div>

                {/* Clone options - shown when URL is detected */}
                {isUrl && (
                  <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      {t('addModal.cloneOptions')}
                    </div>

                    {/* Target Directory */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {t('addModal.targetDirectory')}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={targetDir}
                          onChange={(e) => setTargetDir(e.target.value)}
                          placeholder={defaultGitReposDir || '~/'}
                          disabled={isAddPending}
                          className="flex-1 text-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTargetDirBrowserOpen(true)}
                          disabled={isAddPending}
                        >
                          {t('addModal.browse')}
                        </Button>
                      </div>
                    </div>

                    {/* Folder Name */}
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {t('addModal.folderName')}
                      </label>
                      <Input
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        placeholder={extractedRepoName || ''}
                        disabled={isAddPending}
                        className="text-xs"
                      />
                    </div>

                    {/* Clone destination preview */}
                    {clonePath && (
                      <div className="rounded-md bg-background px-3 py-2 text-xs text-muted-foreground">
                        {t('addModal.willCloneTo')}:{' '}
                        <span className="font-mono">{clonePath}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Cloning state */}
                {isAddPending && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                    {isUrl ? t('addModal.cloning') : t('addModal.adding')}
                  </div>
                )}

                {/* Error state */}
                {addError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      size={14}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{addError}</span>
                  </div>
                )}

                <DialogFooter>
                  <DialogClose render={<Button variant="outline" disabled={isAddPending} />}>
                    {t('addModal.cancel')}
                  </DialogClose>
                  <Button type="submit" disabled={!input.trim() || isAddPending}>
                    {addError ? t('addModal.retry') : t('addModal.add')}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            {/* Scan Tab */}
            <TabsContent value="scan">
              <div className="space-y-4 pt-4">
                {/* Directory input */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('bulkAdd.directoryLabel')}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={scanDirectory}
                      onChange={(e) => {
                        setScanDirectory(e.target.value)
                        setScanError(null)
                        setScannedRepos(null)
                      }}
                      placeholder={defaultGitReposDir || t('bulkAdd.directoryPlaceholder')}
                      disabled={isScanPending}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setScanBrowserOpen(true)}
                      disabled={isScanPending}
                    >
                      {t('bulkAdd.browse')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleScan}
                      disabled={isScanPending || !effectiveScanDirectory}
                    >
                      {scanMutation.isPending ? (
                        <HugeiconsIcon
                          icon={Loading03Icon}
                          size={16}
                          strokeWidth={2}
                          className="animate-spin"
                        />
                      ) : (
                        <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={2} />
                      )}
                      {t('bulkAdd.scan')}
                    </Button>
                  </div>
                </div>

                {/* Scan results */}
                {scannedRepos !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t('bulkAdd.foundRepos', { count: scannedRepos.length })}
                      </label>
                      {addableRepos.length > 0 && (
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={handleSelectAll}
                            disabled={isScanPending}
                          >
                            {t('bulkAdd.selectAll')}
                          </button>
                          <span className="text-muted-foreground">/</span>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={handleSelectNone}
                            disabled={isScanPending}
                          >
                            {t('bulkAdd.selectNone')}
                          </button>
                        </div>
                      )}
                    </div>

                    {scannedRepos.length === 0 ? (
                      <div className="rounded-md bg-muted/50 px-3 py-4 text-center text-sm text-muted-foreground">
                        {t('bulkAdd.noReposFound')}
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto rounded-md border">
                        {scannedRepos.map((repo) => (
                          <div
                            key={repo.path}
                            className={`flex items-center gap-3 border-b px-3 py-2 last:border-b-0 ${
                              repo.exists ? 'bg-muted/30 opacity-60' : ''
                            }`}
                          >
                            <Checkbox
                              checked={selected.has(repo.path)}
                              onCheckedChange={() => handleToggle(repo.path)}
                              disabled={repo.exists || isScanPending}
                            />
                            <HugeiconsIcon
                              icon={repo.exists ? CheckmarkCircle02Icon : Folder01Icon}
                              size={16}
                              strokeWidth={2}
                              className={repo.exists ? 'text-green-500' : 'text-muted-foreground'}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{repo.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {repo.path}
                              </div>
                            </div>
                            {repo.exists && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {t('bulkAdd.alreadyAdded')}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Adding state */}
                {bulkCreateMutation.isPending && (
                  <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={16}
                      strokeWidth={2}
                      className="animate-spin"
                    />
                    {t('bulkAdd.adding')}
                  </div>
                )}

                {/* Error state */}
                {scanError && (
                  <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      size={14}
                      strokeWidth={2}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{scanError}</span>
                  </div>
                )}

                <DialogFooter>
                  <DialogClose render={<Button variant="outline" disabled={isScanPending} />}>
                    {t('bulkAdd.cancel')}
                  </DialogClose>
                  <Button
                    onClick={handleBulkAdd}
                    disabled={selected.size === 0 || isScanPending}
                  >
                    {t('bulkAdd.addSelected', { count: selected.size })}
                  </Button>
                </DialogFooter>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Filesystem browsers */}
      <FilesystemBrowser
        open={inputBrowserOpen}
        onOpenChange={setInputBrowserOpen}
        onSelect={handleInputBrowseSelect}
        initialPath={defaultGitReposDir || undefined}
      />
      <FilesystemBrowser
        open={targetDirBrowserOpen}
        onOpenChange={setTargetDirBrowserOpen}
        onSelect={handleTargetDirBrowseSelect}
        initialPath={effectiveTargetDir || undefined}
      />
      <FilesystemBrowser
        open={scanBrowserOpen}
        onOpenChange={setScanBrowserOpen}
        onSelect={handleScanBrowseSelect}
        initialPath={effectiveScanDirectory || undefined}
      />
    </>
  )
}
