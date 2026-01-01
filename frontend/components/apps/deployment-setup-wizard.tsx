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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useDeploymentPrerequisites,
  useStartTraefik,
  useDetectPublicIp,
  useUpdateDeploymentSettings,
  useDeploymentSettings,
} from '@/hooks/use-apps'
import { cn } from '@/lib/utils'

interface DeploymentSetupWizardProps {
  onComplete?: () => void
  onSkip?: () => void
}

type Step = 'docker' | 'traefik' | 'settings' | 'complete'

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
  const stepOrder: Step[] = ['docker', 'traefik', 'settings', 'complete']
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

export function DeploymentSetupWizard({ onComplete, onSkip }: DeploymentSetupWizardProps) {
  const { data: prereqs, isLoading: prereqsLoading, refetch: refetchPrereqs } = useDeploymentPrerequisites()
  const { data: settings } = useDeploymentSettings()
  const startTraefik = useStartTraefik()
  const detectIp = useDetectPublicIp()
  const updateSettings = useUpdateDeploymentSettings()

  const [currentStep, setCurrentStep] = useState<Step>('docker')
  const [settingsForm, setSettingsForm] = useState({
    cloudflareApiToken: '',
    serverPublicIp: '',
    defaultDomain: '',
    acmeEmail: '',
  })

  // Initialize form with existing settings
  useState(() => {
    if (settings) {
      setSettingsForm({
        cloudflareApiToken: '',
        serverPublicIp: settings.serverPublicIp || '',
        defaultDomain: settings.defaultDomain || '',
        acmeEmail: settings.acmeEmail || '',
      })
    }
  })

  // Determine current step based on prerequisites
  // With Traefik, we auto-start if needed, so we just need Docker running
  const determineStep = (): Step => {
    if (!prereqs) return 'docker'
    if (!prereqs.docker.installed || !prereqs.docker.running) return 'docker'
    // Traefik step shows detected info or offers to start Vibora's Traefik
    if (!prereqs.traefik.detected && prereqs.traefik.type === 'none') return 'traefik'
    if (!prereqs.settings.serverIpConfigured) return 'settings'
    return 'complete'
  }

  // Auto-advance step when prerequisites change
  const stepOrder: Step[] = ['docker', 'traefik', 'settings', 'complete']
  const effectiveStepIndex = prereqsLoading ? stepOrder.indexOf(currentStep) : Math.max(
    stepOrder.indexOf(currentStep),
    stepOrder.indexOf(determineStep())
  )
  const displayStep = stepOrder[Math.min(effectiveStepIndex, stepOrder.length - 1)]

  const handleStartTraefik = async () => {
    await startTraefik.mutateAsync()
    await refetchPrereqs()
  }

  const handleDetectIp = async () => {
    const result = await detectIp.mutateAsync()
    if (result.success) {
      setSettingsForm((prev) => ({ ...prev, serverPublicIp: result.ip }))
    }
  }

  const handleSaveSettings = async () => {
    await updateSettings.mutateAsync({
      cloudflareApiToken: settingsForm.cloudflareApiToken || null,
      serverPublicIp: settingsForm.serverPublicIp || null,
      defaultDomain: settingsForm.defaultDomain || null,
      acmeEmail: settingsForm.acmeEmail || null,
    })
    await refetchPrereqs()
    setCurrentStep('complete')
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
          <div className="h-px flex-1 mx-2 bg-border" />
          <StepIndicator
            step="settings"
            currentStep={displayStep}
            label="Settings"
            status={displayStep === 'complete' ? 'complete' : displayStep === 'settings' ? 'current' : 'pending'}
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
                        : prereqs.traefik.type === 'vibora'
                          ? 'Vibora Traefik running'
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
                      Vibora can start its own Traefik container for you.
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
                <Button onClick={() => setCurrentStep('settings')}>
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

        {/* Settings step */}
        {displayStep === 'settings' && (
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serverIp">Server Public IP</Label>
                <div className="flex gap-2">
                  <Input
                    id="serverIp"
                    value={settingsForm.serverPublicIp}
                    onChange={(e) => setSettingsForm((prev) => ({ ...prev, serverPublicIp: e.target.value }))}
                    placeholder="e.g., 5.78.100.199"
                  />
                  <Button
                    variant="outline"
                    onClick={handleDetectIp}
                    disabled={detectIp.isPending}
                  >
                    {detectIp.isPending ? (
                      <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" />
                    ) : (
                      'Detect'
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  The public IP address of this server for DNS records.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="defaultDomain">Default Domain (optional)</Label>
                <Input
                  id="defaultDomain"
                  value={settingsForm.defaultDomain}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, defaultDomain: e.target.value }))}
                  placeholder="e.g., example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Apps will be deployed to subdomains of this domain.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="acmeEmail">ACME Email (optional)</Label>
                <Input
                  id="acmeEmail"
                  type="email"
                  value={settingsForm.acmeEmail}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, acmeEmail: e.target.value }))}
                  placeholder="e.g., admin@example.com"
                />
                <p className="text-xs text-muted-foreground">
                  Email for Let's Encrypt certificate notifications.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cfToken">Cloudflare API Token (optional)</Label>
                <Input
                  id="cfToken"
                  type="password"
                  value={settingsForm.cloudflareApiToken}
                  onChange={(e) => setSettingsForm((prev) => ({ ...prev, cloudflareApiToken: e.target.value }))}
                  placeholder="Enter token to enable automatic DNS"
                />
                <p className="text-xs text-muted-foreground">
                  Enables automatic DNS record creation. Requires Zone:DNS:Edit permission.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onSkip}>
                Skip for now
              </Button>
              <Button
                onClick={handleSaveSettings}
                disabled={updateSettings.isPending || !settingsForm.serverPublicIp}
              >
                {updateSettings.isPending ? (
                  <HugeiconsIcon icon={Loading03Icon} size={16} strokeWidth={2} className="animate-spin" data-slot="icon" />
                ) : null}
                Save & Continue
              </Button>
            </div>
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
