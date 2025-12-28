import { useState, useMemo } from 'react'
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
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Folder01Icon,
  Alert02Icon,
  Link01Icon,
} from '@hugeicons/core-free-icons'
import { useDefaultGitReposDir } from '@/hooks/use-config'
import {
  useCreateRepository,
  useCloneRepository,
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
}

export function AddRepositoryDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddRepositoryDialogProps) {
  const { t } = useTranslation('repositories')
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [browserOpen, setBrowserOpen] = useState(false)

  const { data: defaultGitReposDir } = useDefaultGitReposDir()
  const createRepository = useCreateRepository()
  const cloneRepository = useCloneRepository()

  const isUrl = useMemo(() => isGitUrl(input.trim()), [input])
  const repoName = useMemo(
    () => (isUrl ? extractRepoNameFromUrl(input.trim()) : null),
    [input, isUrl]
  )
  const clonePath = useMemo(
    () =>
      repoName && defaultGitReposDir
        ? `${defaultGitReposDir}/${repoName}`
        : null,
    [repoName, defaultGitReposDir]
  )

  const isPending = createRepository.isPending || cloneRepository.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const value = input.trim()
    if (!value) return

    if (isUrl) {
      // Clone from URL
      cloneRepository.mutate(
        { url: value },
        {
          onSuccess: (repo) => {
            setInput('')
            onOpenChange(false)
            onSuccess?.(repo.id)
          },
          onError: (err) => {
            setError(err instanceof Error ? err.message : t('addModal.cloneFailed'))
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
            setInput('')
            onOpenChange(false)
            onSuccess?.(repo.id)
          },
          onError: (err) => {
            setError(err instanceof Error ? err.message : t('addModal.createFailed'))
          },
        }
      )
    }
  }

  const handleBrowseSelect = (path: string) => {
    setInput(path)
    setBrowserOpen(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setInput('')
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('addModal.title')}</DialogTitle>
            <DialogDescription>{t('addModal.description')}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                      setError(null)
                    }}
                    placeholder={t('addModal.inputPlaceholder')}
                    disabled={isPending}
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
                  onClick={() => setBrowserOpen(true)}
                  disabled={isPending}
                >
                  {t('addModal.browse')}
                </Button>
              </div>
            </div>

            {/* Clone destination preview */}
            {isUrl && clonePath && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {t('addModal.willCloneTo')}: <span className="font-mono">{clonePath}</span>
              </div>
            )}

            {/* Cloning state */}
            {isPending && (
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
            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <HugeiconsIcon
                  icon={Alert02Icon}
                  size={14}
                  strokeWidth={2}
                  className="mt-0.5 shrink-0"
                />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" disabled={isPending} />}>
                {t('addModal.cancel')}
              </DialogClose>
              <Button type="submit" disabled={!input.trim() || isPending}>
                {error ? t('addModal.retry') : t('addModal.add')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FilesystemBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handleBrowseSelect}
        initialPath={defaultGitReposDir || undefined}
      />
    </>
  )
}
