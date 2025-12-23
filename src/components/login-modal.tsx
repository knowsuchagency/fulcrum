import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'

export function LoginModal() {
  const { t } = useTranslation('common')
  const { showLoginModal, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError(null)
      setIsLoading(true)

      try {
        await login(username, password)
      } catch (err) {
        setError(err instanceof Error ? err.message : t('auth.loginFailed'))
      } finally {
        setIsLoading(false)
      }
    },
    [username, password, login, t]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading && username && password) {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <Dialog open={showLoginModal}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{t('auth.loginTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup className="mt-4">
            <Field>
              <FieldLabel htmlFor="login-username">{t('auth.username')}</FieldLabel>
              <Input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="login-password">{t('auth.password')}</FieldLabel>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="submit" disabled={isLoading || !username || !password}>
              {isLoading ? t('status.loggingIn') : t('auth.login')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
