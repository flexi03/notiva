import { useState } from 'react'
import { CloudUpload, ExternalLink } from 'lucide-react'
import { enterToken } from '@/app/clone'
import { useGit } from '@/app/git'
import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { Button, Dialog, TextInput } from '@/components/ui'

/**
 * "Remote hinzufügen": a short guide (create an empty repository on GitHub / GitLab, copy its
 * address), then origin is set and everything uploaded once. Errors are explained with the fix:
 * login (token), wrong address, repository not empty.
 */
export function RemoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const [problem, setProblem] = useState<null | {
    kind: 'LOGIN' | 'NOTFOUND' | 'NOTEMPTY' | 'INVALID' | 'OTHER'
    text: string
  }>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useGit((s) => s.refresh)
  const openUrl = (u: string) => void electronBridge()?.openExternal(u)
  const valid = /^(https:\/\/[^\s/]+\/\S+|git@[^\s:]+:\S+)$/.test(url.trim())

  const connect = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await withProgress(t('remote.uploading'), () => electronBridge()!.git!.addRemote!(url.trim()), {
        success: () => t('remote.done'),
      })
      await refresh()
      onClose()
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      const kind = (/^(?:Error: )?(LOGIN|NOTFOUND|NOTEMPTY|INVALID):/.exec(text)?.[1] ?? 'OTHER') as
        'LOGIN' | 'NOTFOUND' | 'NOTEMPTY' | 'INVALID' | 'OTHER'
      setProblem({ kind, text: text.replace(/^(?:Error: )?[A-Z]+: /, '') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('remote.title')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={<CloudUpload size={15} />}
            disabled={!valid || busy}
            onClick={() => void connect()}
          >
            {t('remote.connect')}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px]" data-testid="remote-dialog">
        <ol className="list-decimal space-y-1.5 pl-5 text-ink-2">
          <li>
            {t('remote.step1')}{' '}
            <span className="inline-flex flex-wrap gap-2">
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => openUrl('https://github.com/new')}
              >
                GitHub <ExternalLink size={11} className="inline" />
              </button>
              <button
                type="button"
                className="font-semibold text-accent hover:underline"
                onClick={() => openUrl('https://gitlab.com/projects/new')}
              >
                GitLab <ExternalLink size={11} className="inline" />
              </button>
            </span>
          </li>
          <li>{t('remote.step2')}</li>
          <li>{t('remote.step3')}</li>
        </ol>
        <label className="block space-y-1">
          <span className="text-[12px] font-semibold text-ink-2">{t('remote.url')}</span>
          <TextInput
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/name/notizen.git"
            aria-label={t('remote.url')}
            autoFocus
          />
        </label>
        <p className="text-[12px] text-ink-3">{t('remote.private')}</p>
        {problem && (
          <div
            role="alert"
            className="space-y-1.5 rounded-control border border-danger/40 bg-danger/10 p-2.5"
            data-testid="remote-problem"
          >
            <p className="font-semibold">{t(`remote.problem.${problem.kind}`)}</p>
            <p className="text-[12px] whitespace-pre-line text-ink-2">{problem.text}</p>
            {problem.kind === 'LOGIN' && /^https:/.test(url.trim()) && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void enterToken(url.trim()).then((saved) => saved && void connect())}
              >
                {t('clone.enterToken')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
