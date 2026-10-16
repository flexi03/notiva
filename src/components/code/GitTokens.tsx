import { useEffect } from 'react'
import { AlertTriangle, KeyRound, RefreshCw } from 'lucide-react'
import { checkGitTokens, removeToken, replaceToken, useGitTokens, useTokenProblem } from '@/app/gitTokens'
import { useAction } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { Button, cx } from '@/components/ui'

/** Settings → Studium: the stored Git tokens, whether they work, replace or remove them. */
export function GitTokensSection() {
  const run = useAction()
  const { list, checkedAt } = useGitTokens()
  useEffect(() => {
    void checkGitTokens()
  }, [])
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  return (
    <div className="space-y-2" data-testid="git-tokens">
      {list.length === 0 ? (
        <p className="text-sm text-ink-3">{t('token.none')}</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((s) => (
            <li key={s.host} className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <KeyRound
                size={14}
                className={cx('shrink-0', s.state === 'invalid' ? 'text-danger' : 'text-accent')}
              />
              <span className="font-medium">{s.host}</span>
              <span
                className={cx(
                  'text-[12.5px]',
                  s.state === 'invalid' ? 'font-semibold text-danger' : 'text-ink-3',
                )}
              >
                {t(`token.state.${s.state}`)}
                {s.expiresAt &&
                  ` · ${t('token.expires', { date: new Date(s.expiresAt).toLocaleDateString(locale) })}`}
              </span>
              <span className="flex-1" />
              <Button
                size="sm"
                variant={s.state === 'invalid' ? 'primary' : 'ghost'}
                onClick={() => void run(() => replaceToken(s.host))}
              >
                {t('token.replace')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void run(() => removeToken(s.host))}>
                {t('token.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={<RefreshCw size={13} />}
        onClick={() => void run(() => checkGitTokens())}
        title={checkedAt ? new Date(checkedAt).toLocaleTimeString(locale) : undefined}
      >
        {t('token.check')}
      </Button>
    </div>
  )
}

/** In a lab folder / repository page: the server's token stopped working → say so, with the fix. */
export function TokenBanner({ remote }: { remote: string | undefined }) {
  const run = useAction()
  const problem = useTokenProblem(remote)
  if (!problem) return null
  const invalid = problem.state === 'invalid'
  return (
    <div
      role="alert"
      data-testid="token-banner"
      className={cx(
        'flex flex-wrap items-center gap-2 rounded-control border px-3 py-2 text-[13px]',
        invalid ? 'border-danger/40 bg-danger/10' : 'border-line bg-sunken',
      )}
    >
      <AlertTriangle size={14} className={cx('shrink-0', invalid ? 'text-danger' : 'text-ink-3')} />
      <span className="min-w-0 flex-1">
        {invalid ? (
          <>
            <span className="font-semibold">{t('token.invalid', { host: problem.host })}</span> –{' '}
            {t('token.invalidNote')}
          </>
        ) : (
          t('token.limited', { host: problem.host })
        )}
      </span>
      <Button
        size="sm"
        variant={invalid ? 'primary' : 'secondary'}
        onClick={() => void run(() => replaceToken(problem.host))}
      >
        {t('token.replace')}
      </Button>
    </div>
  )
}
