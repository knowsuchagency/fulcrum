import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Tick02Icon,
  Cancel01Icon,
  Loading03Icon,
  Alert02Icon,
  ArrowRight01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useDeploymentPrerequisites,
  useStartTraefik,
} from '@/hooks/use-apps'
import { cn } from '@/lib/utils'

interface DeploymentSetupWizardProps {
  onComplete?: () => void
}

type Step = 'docker' | 'traefik' | 'complete'

function StepIndicator({
  step,
  currentStep,
  label,
  status,
}: {
  step: Step
  currentStep: Step
  label: string
  status: 'pending' | 'current' | 'complete' | 'error'
}) {
  const stepOrder: Step[] = ['docker', 'traefik', 'complete']
  const stepIndex = stepOrder.indexOf(step)
  const currentIndex = stepOrder.indexOf(currentStep)
  const isCurrent = step === currentStep
  const isComplete = stepIndex < currentIndex || status === 'complete'

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
          isComplete && 'bg-green-500 text-white',
          isCurrent && 'bg-primary text-primary-foreground',
          !isComplete && !isCurrent && 'bg-muted text-muted-foreground',
          status === 'error' && 'bg-destructive text-destructive-foreground'
        )}
      >
        {isComplete ? (
          <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />
        ) : status === 'error' ? (
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
        ) : (
          stepIndex + 1
        )}
      </div>
      <span
        className={cn(
          'text-sm',
          isCurrent && 'font-medium',
          !isComplete && !isCurrent && 'text-muted-foreground'
        )}
      >
        {label}
      </span>
    </div>
  )
}

export function DeploymentSetupWizard({ onComplete }: DeploymentSetupWizardProps) {
  const { data: prereqs, isLoading: prereqsLoading, refetch: refetchPrereqs } = useDeploymentPrerequisites()
  const startTraefik = useStartTraefik()

  const [currentStep, setCurrentStep] = useState<Step>('docker')

  // Determine current step based on prerequisites
  // With Traefik, we auto-start if needed, so we just need Docker running
  const determineStep = (): Step => {
    if (!prereqs) return 'docker'
    if (!prereqs.docker.installed || !prereqs.docker.running) return 'docker'
    // Traefik step shows detected info or offers to start Fulcrum's Traefik
    if (!prereqs.traefik.detected && prereqs.traefik.type === 'none') return 'traefik'
    return 'complete'
  }

  // Auto-advance step when prerequisites change
  const stepOrder: Step[] = ['docker', 'traefik', 'complete']
  const effectiveStepIndex = prereqsLoading ? stepOrder.indexOf(currentStep) : Math.max(
    stepOrder.indexOf(currentStep),
    stepOrder.indexOf(determineStep())
  )
  const displayStep = stepOrder[Math.min(effectiveStepIndex, stepOrder.length - 1)]

  const handleStartTraefik = async () => {
    await startTraefik.mutateAsync()
    await refetchPrereqs()
  }

  const handleComplete = () => {
    onComplete?.()
  }

  if (prereqsLoading) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="flex items-center justify-center py-12">
          <HugeiconsIcon icon={Loading03Icon} size={24} strokeWidth={2} className="animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Deployment Setup</CardTitle>
        <CardDescription>
          Configure your server for deploying containerized applications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step indicators */}
        <div className="flex items-center justify-between">
          <StepIndicator
            step="docker"
            currentStep={displayStep}
            label="Docker"
            status={prereqs?.docker.running ? 'complete' : displayStep === 'docker' ? 'current' : 'pending'}
          />
          <div className="h-px flex-1 mx-2 bg-border" />
          <StepIndicator
            step="traefik"
            currentStep={displayStep}
            label="Traefik"
            status={prereqs?.traefik.detected ? 'complete' : displayStep === 'traefik' ? 'current' : 'pending'}
          />
        </div>

        {/* Docker step */}
        {displayStep === 'docker' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              {!prereqs?.docker.installed ? (
                <>
                  <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} className="mt-0.5 text-destructive" />
                  <div className="space-y-2">
                    <p className="font-medium">Docker is not installed</p>
                    <p className="text-sm text-muted-foreground">
                      Docker is required to deploy containerized applications.
                    </p>
                    <a
                      href="https://docs.docker.com/get-docker/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Install Docker →
                    </a>
                  </div>
                </>
              ) : !prereqs?.docker.running ? (
                <>
                  <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} className="mt-0.5 text-amber-500" />
                  <div className="space-y-2">
                    <p className="font-medium">Docker is not running</p>
                    <p className="text-sm text-muted-foreground">
                      Docker is installed (v{prereqs.docker.version}) but the daemon is not running.
                    </p>
                    <p className="text-sm text-muted-foreground">Start Docker and click refresh.</p>
                  </div>
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={Tick02Icon} size={20} strokeWidth={2} className="mt-0.5 text-green-500" />
                  <div>
                    <p className="font-medium">Docker is running</p>
                    <p className="text-sm text-muted-foreground">Version {prereqs.docker.version}</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => refetchPrereqs()}>
                <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={2} data-slot="icon" />
                Refresh
              </Button>
              {prereqs?.docker.running && (
                <Button onClick={() => setCurrentStep('traefik')}>
                  Continue
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} data-slot="icon" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Traefik step */}
        {displayStep === 'traefik' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              {prereqs?.traefik.detected ? (
                <>
                  <HugeiconsIcon icon={Tick02Icon} size={20} strokeWidth={2} className="mt-0.5 text-green-500" />
                  <div>
                    <p className="font-medium">
                      {prereqs.traefik.type === 'dokploy'
                        ? 'Dokploy Traefik detected'
                        : prereqs.traefik.type === 'fulcrum'
                          ? 'Fulcrum Traefik running'
                          : 'Traefik detected'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Reverse proxy is ready to route traffic to your apps.
                    </p>
                    {prereqs.traefik.containerName && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Container: {prereqs.traefik.containerName}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <HugeiconsIcon icon={Alert02Icon} size={20} strokeWidth={2} className="mt-0.5 text-amber-500" />
                  <div className="space-y-2">
                    <p className="font-medium">No Traefik detected</p>
                    <p className="text-sm text-muted-foreground">
                      Traefik handles HTTPS certificates and routes traffic to your apps.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Fulcrum can start its own Traefik container for you.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2">
              {!prereqs?.traefik.detected && (
                <Button onClick={handleStartTraefik} disabled={startTraefik.isPending}>
                  {startTraefik.isPending ? (
                    <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" data-slot="icon" />
                  ) : null}
                  Start Traefik
                </Button>
              )}
              {prereqs?.traefik.detected && (
                <Button onClick={() => setCurrentStep('complete')}>
                  Continue
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} data-slot="icon" />
                </Button>
              )}
            </div>

            {startTraefik.isError && (
              <p className="text-sm text-destructive">
                Failed to start Traefik: {(startTraefik.error as Error)?.message || 'Unknown error'}
              </p>
            )}
          </div>
        )}

        {/* Complete step */}
        {displayStep === 'complete' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <HugeiconsIcon icon={Tick02Icon} size={20} strokeWidth={2} className="mt-0.5 text-green-500" />
              <div>
                <p className="font-medium text-green-600 dark:text-green-400">Setup Complete</p>
                <p className="text-sm text-muted-foreground">
                  Your server is ready to deploy containerized applications.
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleComplete}>
                Create Your First App
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={2} data-slot="icon" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
