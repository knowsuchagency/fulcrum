import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FilesystemBrowser } from '@/components/ui/filesystem-browser'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ArrowDownDoubleIcon,
  Loading03Icon,
  Folder01Icon,
  FolderAddIcon,
  HelpCircleIcon,
} from '@hugeicons/core-free-icons'
import {
  useCopierTemplates,
  useCopierQuestions,
  useCreateProjectFromTemplate,
} from '@/hooks/use-copier'
import { useDefaultGitReposDir } from '@/hooks/use-config'
import { cn } from '@/lib/utils'
import type { CopierQuestion } from '@/types'

type WizardStep = 'template' | 'questions' | 'output' | 'creating'

export function NewProjectDialog() {
  const { t } = useTranslation('repositories')
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<WizardStep>('template')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [hasMoreContent, setHasMoreContent] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Form state
  const [templateSource, setTemplateSource] = useState('')
  const [customTemplateUrl, setCustomTemplateUrl] = useState('')
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [outputPath, setOutputPath] = useState('')
  const [projectName, setProjectName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  // Queries
  const { data: templates } = useCopierTemplates()
  const { data: defaultGitReposDir } = useDefaultGitReposDir()
  const effectiveSource = templateSource || customTemplateUrl
  const {
    data: questionsData,
    isLoading: questionsLoading,
    error: questionsError,
  } = useCopierQuestions(step === 'questions' || step === 'output' ? effectiveSource : null)
  const createProject = useCreateProjectFromTemplate()

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setStep('template')
      setTemplateSource('')
      setCustomTemplateUrl('')
      setAnswers({})
      setOutputPath(defaultGitReposDir || '')
      setProjectName('')
      setCreateError(null)
    }
  }, [open, defaultGitReposDir])

  // Initialize answers with defaults when questions load (only for questions not already answered)
  useEffect(() => {
    if (questionsData?.questions) {
      setAnswers((prev) => {
        const merged = { ...prev }
        for (const q of questionsData.questions) {
          // Only set default if we don't already have an answer for this question
          if (merged[q.name] === undefined && q.default !== undefined) {
            merged[q.name] = q.default
          }
        }
        return merged
      })
    }
  }, [questionsData])

  // Check if scroll area has more content
  const checkScrollContent = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const hasMore = el.scrollHeight > el.clientHeight &&
      el.scrollTop + el.clientHeight < el.scrollHeight - 10
    setHasMoreContent(hasMore)
  }, [])

  // Re-check on step change or questions load
  useEffect(() => {
    // Small delay to let content render
    const timer = setTimeout(checkScrollContent, 100)
    return () => clearTimeout(timer)
  }, [step, questionsData, checkScrollContent])

  const handleScroll = useCallback(() => {
    checkScrollContent()
  }, [checkScrollContent])

  const handleNext = () => {
    if (step === 'template') {
      setStep('questions')
    } else if (step === 'questions') {
      setStep('output')
    }
  }

  const handleBack = () => {
    if (step === 'questions') {
      setStep('template')
    } else if (step === 'output') {
      setStep('questions')
    }
  }

  const handleCreate = () => {
    setStep('creating')
    setCreateError(null)
    createProject.mutate(
      {
        templateSource: effectiveSource,
        outputPath,
        answers,
        projectName,
      },
      {
        onSuccess: (data) => {
          setOpen(false)
          navigate({ to: '/repositories/$repoId', params: { repoId: data.repositoryId } })
        },
        onError: (error) => {
          setCreateError(error.message)
          setStep('output')
        },
      }
    )
  }

  const renderQuestionField = (question: CopierQuestion) => {
    const value = answers[question.name]
    const setValue = (v: unknown) => setAnswers((prev) => ({ ...prev, [question.name]: v }))

    // Question is required if it has no default (or default is a Jinja2 template)
    const isRequired = question.default === undefined ||
      (typeof question.default === 'string' && question.default.includes('{{'))

    const labelText = isRequired ? `${question.name} *` : question.name

    switch (question.type) {
      case 'bool':
        return (
          <Field key={question.name}>
            <div className="flex items-center gap-2">
              <Checkbox checked={value as boolean} onCheckedChange={setValue} />
              <FieldLabel className="cursor-pointer">{labelText}</FieldLabel>
            </div>
            {question.help && <FieldDescription>{question.help}</FieldDescription>}
          </Field>
        )

      case 'int':
      case 'float':
        return (
          <Field key={question.name}>
            <FieldLabel>{labelText}</FieldLabel>
            <Input
              type="number"
              value={value as number}
              onChange={(e) =>
                setValue(
                  question.type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value)
                )
              }
              step={question.type === 'float' ? 'any' : 1}
            />
            {question.help && <FieldDescription>{question.help}</FieldDescription>}
          </Field>
        )

      case 'str':
      default: {
        if (question.choices && question.choices.length > 0) {
          return (
            <Field key={question.name}>
              <FieldLabel>{labelText}</FieldLabel>
              <Select value={String(value ?? '')} onValueChange={setValue}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {question.choices.map((choice) => (
                    <SelectItem key={String(choice.value)} value={String(choice.value)}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {question.help && <FieldDescription>{question.help}</FieldDescription>}
            </Field>
          )
        }

        // Check if multiline (yaml/json types)
        const isMultiline = question.type === 'yaml' || question.type === 'json'

        return (
          <Field key={question.name}>
            <FieldLabel>{labelText}</FieldLabel>
            {isMultiline ? (
              <Textarea
                value={String(value ?? '')}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
              />
            ) : (
              <Input value={String(value ?? '')} onChange={(e) => setValue(e.target.value)} />
            )}
            {question.help && <FieldDescription>{question.help}</FieldDescription>}
          </Field>
        )
      }
    }
  }

  const canProceedFromTemplate = !!effectiveSource

  // Check if all required questions (those without defaults) have answers
  const missingRequiredQuestions = questionsData?.questions.filter((q) => {
    // Question is required if it has no default (or default is a Jinja2 template)
    const hasDefault = q.default !== undefined &&
      !(typeof q.default === 'string' && q.default.includes('{{'))
    if (hasDefault) return false

    // Check if we have a non-empty answer
    const answer = answers[q.name]
    if (answer === undefined || answer === null || answer === '') return true
    return false
  }) ?? []

  const canProceedFromQuestions = questionsData && !questionsLoading && missingRequiredQuestions.length === 0
  const canCreate = projectName.trim() && outputPath.trim()

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <HugeiconsIcon icon={FolderAddIcon} size={16} strokeWidth={2} data-slot="icon" />
          {t('newProject.button')}
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg max-h-[80dvh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {t('newProject.title')}
              <Tooltip>
                <TooltipTrigger className="text-muted-foreground hover:text-foreground transition-colors">
                  <HugeiconsIcon icon={HelpCircleIcon} size={16} strokeWidth={2} />
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="max-w-xs">
                  <p>
                    {t('newProject.steps.template.help')}{' '}
                    <a
                      href="https://copier.readthedocs.io/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:opacity-80"
                    >
                      {t('newProject.steps.template.learnMore')}
                    </a>
                  </p>
                </TooltipContent>
              </Tooltip>
            </DialogTitle>
            <DialogDescription>
              {step === 'template' && t('newProject.steps.template.description')}
              {step === 'questions' && t('newProject.steps.questions.description')}
              {step === 'output' && t('newProject.steps.output.description')}
              {step === 'creating' && t('newProject.steps.creating.description')}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex gap-2 shrink-0 mt-2">
            {(['template', 'questions', 'output'] as const).map((s, i) => (
              <div
                key={s}
                className={cn(
                  'flex-1 h-1 rounded',
                  step === s ||
                    ['template', 'questions', 'output'].indexOf(step) > i ||
                    step === 'creating'
                    ? 'bg-primary'
                    : 'bg-muted'
                )}
              />
            ))}
          </div>

          {/* Step content */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto min-h-0 py-4 scrollbar-visible"
          >
            {step === 'template' && (
              <FieldGroup>
                <Field>
                  <FieldLabel>{t('newProject.steps.template.savedTemplates')}</FieldLabel>
                  <Select
                    value={templateSource}
                    onValueChange={(v) => {
                      setTemplateSource(v ?? '')
                      setCustomTemplateUrl('')
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {templateSource ? (
                          templates?.find((t) => t.id === templateSource)?.displayName
                        ) : (
                          <span className="text-muted-foreground">
                            {t('newProject.steps.template.selectTemplate')}
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {templates?.map((repo) => (
                        <SelectItem key={repo.id} value={repo.id}>
                          {repo.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="text-center text-muted-foreground text-xs py-2">
                  {t('newProject.steps.template.or')}
                </div>

                <Field>
                  <FieldLabel>{t('newProject.steps.template.customUrl')}</FieldLabel>
                  <Input
                    value={customTemplateUrl}
                    onChange={(e) => {
                      setCustomTemplateUrl(e.target.value)
                      setTemplateSource('')
                    }}
                    placeholder="https://github.com/user/template or /path/to/template"
                  />
                  <FieldDescription>{t('newProject.steps.template.customUrlHelp')}</FieldDescription>
                </Field>
              </FieldGroup>
            )}

            {step === 'questions' && (
              <FieldGroup>
                {questionsLoading && (
                  <div className="flex items-center justify-center py-8">
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      size={24}
                      strokeWidth={2}
                      className="animate-spin text-muted-foreground"
                    />
                  </div>
                )}
                {questionsError && (
                  <div className="text-destructive text-sm py-4">{questionsError.message}</div>
                )}
                {questionsData?.questions.map(renderQuestionField)}
                {questionsData && questionsData.questions.length === 0 && (
                  <div className="text-muted-foreground text-sm py-4">
                    {t('newProject.steps.questions.noQuestions')}
                  </div>
                )}
              </FieldGroup>
            )}

            {step === 'output' && (
              <FieldGroup>
                <Field>
                  <FieldLabel>{t('newProject.steps.output.projectName')}</FieldLabel>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="my-new-project"
                  />
                </Field>

                <Field>
                  <FieldLabel>{t('newProject.steps.output.outputDirectory')}</FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start font-normal"
                    onClick={() => setBrowserOpen(true)}
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={14}
                      strokeWidth={2}
                      className="mr-2"
                    />
                    {outputPath || t('newProject.steps.output.selectDirectory')}
                  </Button>
                </Field>

                {projectName && outputPath && (
                  <FieldDescription className="font-mono text-xs">
                    {t('newProject.steps.output.willCreate')}: {outputPath}/{projectName}
                  </FieldDescription>
                )}

                {createError && (
                  <div className="text-destructive text-sm mt-2 p-2 bg-destructive/10 rounded">
                    {createError}
                  </div>
                )}
              </FieldGroup>
            )}

            {step === 'creating' && (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={32}
                  strokeWidth={2}
                  className="animate-spin text-primary"
                />
                <span className="text-sm text-muted-foreground">
                  {t('newProject.steps.creating.inProgress')}
                </span>
              </div>
            )}
          </div>

          {/* Scroll indicator */}
          {hasMoreContent && (
            <div className="flex justify-center py-1">
              <HugeiconsIcon
                icon={ArrowDownDoubleIcon}
                size={16}
                strokeWidth={2}
                className="text-muted-foreground animate-bounce"
              />
            </div>
          )}

          <DialogFooter className="shrink-0">
            {step !== 'template' && step !== 'creating' && (
              <Button variant="outline" onClick={handleBack}>
                <HugeiconsIcon icon={ArrowLeft02Icon} size={16} strokeWidth={2} data-slot="icon" />
                {t('newProject.back')}
              </Button>
            )}

            {step === 'template' && (
              <DialogClose render={<Button variant="outline" />}>
                {t('addModal.cancel')}
              </DialogClose>
            )}

            {step === 'template' && (
              <Button onClick={handleNext} disabled={!canProceedFromTemplate}>
                {t('newProject.next')}
                <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={2} data-slot="icon" />
              </Button>
            )}

            {step === 'questions' && (
              <Button onClick={handleNext} disabled={!canProceedFromQuestions}>
                {t('newProject.next')}
                <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={2} data-slot="icon" />
              </Button>
            )}

            {step === 'output' && (
              <Button onClick={handleCreate} disabled={!canCreate || createProject.isPending}>
                {t('newProject.create')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilesystemBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={(path) => setOutputPath(path)}
        initialPath={defaultGitReposDir || undefined}
      />
    </>
  )
}
