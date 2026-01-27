/**
 * Email Setup Component - Configure SMTP/IMAP for email messaging channel
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Loading03Icon,
  Tick02Icon,
  Cancel01Icon,
  TestTube01Icon,
  Alert02Icon,
} from '@hugeicons/core-free-icons'
import {
  useEmailStatus,
  useConfigureEmail,
  useTestEmailCredentials,
  useDisableEmail,
  useEmailSessions,
} from '@/hooks/use-messaging'

interface EmailSetupProps {
  isLoading?: boolean
}

// Well-known email provider settings (auto-detected from email domain)
const KNOWN_PROVIDERS: Record<string, {
  smtp: { host: string; port: number; secure: boolean }
  imap: { host: string; port: number; secure: boolean }
  note?: string
}> = {
  'gmail.com': {
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    note: 'Requires an App Password. Go to Google Account > Security > 2-Step Verification > App passwords.',
  },
  'googlemail.com': {
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    note: 'Requires an App Password. Go to Google Account > Security > 2-Step Verification > App passwords.',
  },
  'outlook.com': {
    smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
  },
  'hotmail.com': {
    smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
  },
  'live.com': {
    smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
  },
  'yahoo.com': {
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  },
  'icloud.com': {
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    note: 'Requires an App-Specific Password from appleid.apple.com.',
  },
}

// Get provider settings from email domain, or generate defaults
function getProviderSettings(email: string) {
  const domain = email.split('@')[1]?.toLowerCase()
  if (domain && KNOWN_PROVIDERS[domain]) {
    return { ...KNOWN_PROVIDERS[domain], isKnown: true }
  }
  // Default: try common patterns for unknown domains
  return {
    smtp: { host: `smtp.${domain || 'example.com'}`, port: 465, secure: true },
    imap: { host: `imap.${domain || 'example.com'}`, port: 993, secure: true },
    isKnown: false,
  }
}

export function EmailSetup({ isLoading = false }: EmailSetupProps) {
  const { data: status, refetch: refetchStatus } = useEmailStatus()
  const { data: sessions } = useEmailSessions()
  const configureEmail = useConfigureEmail()
  const testCredentials = useTestEmailCredentials()
  const disableEmailMutation = useDisableEmail()

  // Form state - simplified to just email + password
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [allowedSenders, setAllowedSenders] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState(993)
  const [imapSecure, setImapSecure] = useState(true)
  const [imapUser, setImapUser] = useState('')
  const [imapPassword, setImapPassword] = useState('')
  const [sendAs, setSendAs] = useState('')
  const [pollInterval, setPollInterval] = useState(30)

  // Test results
  const [testResult, setTestResult] = useState<{
    success: boolean
    smtpOk: boolean
    imapOk: boolean
    error?: string
  } | null>(null)

  const isConnected = status?.status === 'connected'
  const isConnecting = status?.status === 'connecting'
  const isEnabled = status?.enabled ?? false

  // Get provider info for current email
  const providerInfo = getProviderSettings(email)

  // Initialize form from existing config
  useEffect(() => {
    if (status?.config) {
      const config = status.config
      // For display name, prefer IMAP user (your Gmail) over SMTP user (might be SES key)
      setEmail(config.imap?.user || config.smtp?.user || '')
      setSmtpHost(config.smtp?.host || '')
      setSmtpPort(config.smtp?.port || 465)
      setSmtpSecure(config.smtp?.secure ?? true)
      setSmtpUser(config.smtp?.user || '')
      setImapHost(config.imap?.host || '')
      setImapPort(config.imap?.port || 993)
      setImapSecure(config.imap?.secure ?? true)
      setImapUser(config.imap?.user || '')
      setSendAs(config.sendAs || '')
      setPollInterval(config.pollIntervalSeconds || 30)
      setAllowedSenders(config.allowedSenders?.join(', ') || '')
      // Show advanced if custom settings were used or different users for SMTP/IMAP
      const detected = getProviderSettings(config.imap?.user || config.smtp?.user || '')
      if ((config.smtp?.host && config.smtp.host !== detected.smtp.host) ||
          (config.smtp?.user && config.imap?.user && config.smtp.user !== config.imap.user)) {
        setShowAdvanced(true)
      }
    }
  }, [status?.config])

  const buildCredentials = () => {
    // Parse allowed senders (comma or newline separated)
    const parsedAllowedSenders = allowedSenders
      .split(/[,\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)

    if (showAdvanced) {
      // Advanced mode: use separate SMTP/IMAP credentials
      return {
        smtp: {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          user: smtpUser,
          password: smtpPassword,
        },
        imap: {
          host: imapHost,
          port: imapPort,
          secure: imapSecure,
          user: imapUser,
          password: imapPassword,
        },
        pollIntervalSeconds: pollInterval,
        sendAs: sendAs || undefined,
        allowedSenders: parsedAllowedSenders.length > 0 ? parsedAllowedSenders : undefined,
      }
    }

    // Simple mode: same email/password for both, auto-detected servers
    return {
      smtp: {
        ...providerInfo.smtp,
        user: email,
        password,
      },
      imap: {
        ...providerInfo.imap,
        user: email,
        password,
      },
      pollIntervalSeconds: pollInterval,
      allowedSenders: parsedAllowedSenders.length > 0 ? parsedAllowedSenders : undefined,
    }
  }

  const handleTest = async () => {
    setTestResult(null)
    try {
      const result = await testCredentials.mutateAsync(buildCredentials())
      setTestResult(result)
      if (result.success) {
        toast.success('Connection test successful')
      } else {
        toast.error(result.error || 'Connection test failed')
      }
    } catch {
      toast.error('Failed to test credentials')
    }
  }

  const handleConfigure = async () => {
    try {
      await configureEmail.mutateAsync(buildCredentials())
      toast.success('Email configured successfully')
      setPassword('') // Clear password from form
      refetchStatus()
    } catch {
      toast.error('Failed to configure email')
    }
  }

  const handleDisable = async () => {
    try {
      await disableEmailMutation.mutateAsync()
      toast.success('Email disabled')
      refetchStatus()
    } catch {
      toast.error('Failed to disable email')
    }
  }

  const isPending =
    configureEmail.isPending ||
    testCredentials.isPending ||
    disableEmailMutation.isPending

  const getStatusIcon = () => {
    if (isConnected) {
      return (
        <HugeiconsIcon
          icon={Tick02Icon}
          size={14}
          strokeWidth={2}
          className="text-green-500"
        />
      )
    }
    if (isConnecting) {
      return (
        <HugeiconsIcon
          icon={Loading03Icon}
          size={14}
          strokeWidth={2}
          className="animate-spin text-yellow-500"
        />
      )
    }
    return (
      <HugeiconsIcon
        icon={Cancel01Icon}
        size={14}
        strokeWidth={2}
        className="text-muted-foreground"
      />
    )
  }

  const getStatusText = () => {
    if (isConnected) {
      return status?.displayName ? `Connected as ${status.displayName}` : 'Connected'
    }
    if (isConnecting) return 'Connecting...'
    if (status?.status === 'credentials_required') return 'Credentials required'
    return 'Disconnected'
  }

  return (
    <div className="space-y-4">
      {/* Enable toggle and status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
          Email
        </label>
        <div className="flex items-center gap-3">
          <Switch
            checked={isEnabled}
            onCheckedChange={(enabled) => {
              if (!enabled) handleDisable()
            }}
            disabled={isLoading || isPending || !isEnabled}
          />
          <span className="flex items-center gap-2 text-sm">
            {getStatusIcon()}
            <span className="text-muted-foreground">{getStatusText()}</span>
          </span>
        </div>
      </div>

      {/* Configuration form (shown when not connected) */}
      {!isConnected && (
        <div className="ml-4 sm:ml-44 space-y-4 max-w-md">
          {/* Simple mode: Email address and password (hidden in advanced mode) */}
          {!showAdvanced && (
            <>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="assistant@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {providerInfo.note && email.includes('@') && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      size={14}
                      strokeWidth={2}
                      className="shrink-0 mt-0.5 text-yellow-500"
                    />
                    {providerInfo.note}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  {email.includes('@gmail.com') || email.includes('@icloud.com') ? 'App Password' : 'Password'}
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {/* Server info (auto-detected) */}
              {email.includes('@') && (
                <div className="text-xs text-muted-foreground">
                  <span>SMTP: {providerInfo.smtp.host}:{providerInfo.smtp.port}</span>
                  <span className="mx-2">|</span>
                  <span>IMAP: {providerInfo.imap.host}:{providerInfo.imap.port}</span>
                  {!providerInfo.isKnown && (
                    <span className="ml-2 text-yellow-600">(auto-detected)</span>
                  )}
                </div>
              )}
            </>
          )}

          {/* Allowed Senders (shown in both modes) */}
          <div className="space-y-2">
            <Label htmlFor="allowedSenders">Allowed Senders</Label>
            <Input
              id="allowedSenders"
              placeholder="you@example.com, *@company.com"
              value={allowedSenders}
              onChange={(e) => setAllowedSenders(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Email addresses that can interact with the assistant. Use *@domain.com for wildcards.
              Others will receive a polite rejection. You can CC the assistant into threads to allow
              all participants.
            </p>
          </div>

          {/* Advanced settings toggle */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? '- Hide advanced settings' : '+ Show advanced settings'}
            </button>
          </div>

          {/* Advanced: Custom server settings */}
          {showAdvanced && (
            <>
              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium mb-3">SMTP Settings (Outgoing)</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="smtpHost">Host</Label>
                      <Input
                        id="smtpHost"
                        placeholder="email-smtp.us-east-2.amazonaws.com"
                        value={smtpHost}
                        onChange={(e) => setSmtpHost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPort">Port</Label>
                      <Input
                        id="smtpPort"
                        type="number"
                        value={smtpPort || providerInfo.smtp.port}
                        onChange={(e) => setSmtpPort(parseInt(e.target.value) || 465)}
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <Switch
                        id="smtpSecure"
                        checked={smtpSecure}
                        onCheckedChange={setSmtpSecure}
                      />
                      <Label htmlFor="smtpSecure">SSL/TLS</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpUser">Username</Label>
                    <Input
                      id="smtpUser"
                      placeholder="SMTP username or access key"
                      value={smtpUser}
                      onChange={(e) => setSmtpUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtpPassword">Password</Label>
                    <Input
                      id="smtpPassword"
                      type="password"
                      placeholder="SMTP password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium mb-3">IMAP Settings (Incoming)</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="imapHost">Host</Label>
                      <Input
                        id="imapHost"
                        placeholder="imap.gmail.com"
                        value={imapHost}
                        onChange={(e) => setImapHost(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imapPort">Port</Label>
                      <Input
                        id="imapPort"
                        type="number"
                        value={imapPort || providerInfo.imap.port}
                        onChange={(e) => setImapPort(parseInt(e.target.value) || 993)}
                      />
                    </div>
                    <div className="flex items-end gap-2 pb-1">
                      <Switch
                        id="imapSecure"
                        checked={imapSecure}
                        onCheckedChange={setImapSecure}
                      />
                      <Label htmlFor="imapSecure">SSL/TLS</Label>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imapUser">Username</Label>
                    <Input
                      id="imapUser"
                      placeholder="you@gmail.com"
                      value={imapUser}
                      onChange={(e) => setImapUser(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="imapPassword">Password</Label>
                    <Input
                      id="imapPassword"
                      type="password"
                      placeholder="IMAP password or app password"
                      value={imapPassword}
                      onChange={(e) => setImapPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Send As email address */}
              <div className="border-t border-border pt-4 space-y-2">
                <Label htmlFor="sendAs">Send As (From Address)</Label>
                <Input
                  id="sendAs"
                  type="email"
                  placeholder="ai@yourdomain.com"
                  value={sendAs}
                  onChange={(e) => setSendAs(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The email address that will appear in the From field. Required when SMTP
                  username is not an email address (e.g., AWS SES access key).
                </p>
              </div>

              {/* Poll interval */}
              <div className="space-y-2">
                <Label htmlFor="pollInterval">Check for new emails every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pollInterval"
                    type="number"
                    className="w-20"
                    min={10}
                    max={300}
                    value={pollInterval}
                    onChange={(e) => setPollInterval(parseInt(e.target.value) || 30)}
                  />
                  <span className="text-sm text-muted-foreground">seconds</span>
                </div>
              </div>
            </>
          )}

          {/* Test result */}
          {testResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                testResult.success
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-red-500/10 text-red-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <HugeiconsIcon
                  icon={testResult.success ? Tick02Icon : Cancel01Icon}
                  size={16}
                  strokeWidth={2}
                />
                <span>{testResult.success ? 'Connection successful' : 'Connection failed'}</span>
              </div>
              {!testResult.success && testResult.error && (
                <p className="mt-1 text-xs">{testResult.error}</p>
              )}
              <div className="mt-2 text-xs space-y-1">
                <p>
                  SMTP: {testResult.smtpOk ? 'OK' : 'Failed'}
                </p>
                <p>
                  IMAP: {testResult.imapOk ? 'OK' : 'Failed'}
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={isPending || (showAdvanced
                ? !smtpHost || !smtpUser || !smtpPassword || !imapHost || !imapUser || !imapPassword
                : !email || !password)}
            >
              {testCredentials.isPending ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  strokeWidth={2}
                  className="mr-2 animate-spin"
                />
              ) : (
                <HugeiconsIcon
                  icon={TestTube01Icon}
                  size={14}
                  strokeWidth={2}
                  className="mr-2"
                />
              )}
              Test Connection
            </Button>
            <Button
              size="sm"
              onClick={handleConfigure}
              disabled={isPending || (showAdvanced
                ? !smtpHost || !smtpUser || !smtpPassword || !imapHost || !imapUser || !imapPassword
                : !email || !password)}
            >
              {configureEmail.isPending ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  strokeWidth={2}
                  className="mr-2 animate-spin"
                />
              ) : null}
              Enable Email
            </Button>
          </div>
        </div>
      )}

      {/* Connected state - show sessions and disable button */}
      {isEnabled && isConnected && (
        <div className="ml-4 sm:ml-44 space-y-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisable}
            disabled={isPending}
          >
            Disable Email
          </Button>

          {/* Allowed senders */}
          {status?.config?.allowedSenders && status.config.allowedSenders.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Allowed Senders
              </h4>
              <div className="text-xs text-muted-foreground font-mono">
                {status.config.allowedSenders.join(', ')}
              </div>
            </div>
          )}

          {/* Active sessions */}
          {sessions && sessions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Active Conversations
              </h4>
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="text-xs text-muted-foreground flex items-center gap-2"
                  >
                    <span className="font-mono">{session.channelUserId}</span>
                    {session.channelUserName && (
                      <span>({session.channelUserName})</span>
                    )}
                    <span className="text-muted-foreground/60">
                      Last: {new Date(session.lastMessageAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      <p className="ml-4 sm:ml-44 text-xs text-muted-foreground">
        Send emails to your configured address to chat with the AI assistant.
        Only allowed senders can interact directly. CC the assistant into threads to allow all
        participants. Use /reset in the email body to start a fresh conversation.
      </p>
    </div>
  )
}
