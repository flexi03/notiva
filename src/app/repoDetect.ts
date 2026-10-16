import { useEffect } from 'react'
import { create } from 'zustand'
import { localModelAvailable, localModelChoice } from '@/app/localModel'
import { withAi } from '@/app/aiActivity'
import { repoUrl } from '@/lib/gitUrl'
import { electronBridge } from '@/lib/vault'

type Repo = { url: string; name: string }

/** Answers of the local model per link (null: not a repository) – kept in this browser. */
const useGuesses = create<Record<string, Repo | null>>(() => ({}))
const KEY = 'notiva:repo-guess:'

function cached(link: string): Repo | null | undefined {
  const known = useGuesses.getState()[link]
  if (known !== undefined) return known
  try {
    const raw = localStorage.getItem(KEY + link)
    return raw === null ? undefined : (JSON.parse(raw) as Repo | null)
  } catch {
    return undefined
  }
}

function remember(link: string, repo: Repo | null) {
  useGuesses.setState({ [link]: repo })
  try {
    localStorage.setItem(KEY + link, JSON.stringify(repo))
  } catch {
    /* private mode */
  }
}

// Not worth asking: videos, clouds, documents, Moodle itself.
const NO_CODE =
  /panopto|youtube|youtu\.be|vimeo|magentacloud|sciebo|nextcloud|dropbox|onedrive|sharepoint|wikipedia|moodle|mdl\.|\.pdf($|\?)|\.docx?($|\?)/i
const HINT = /repo|git|code|quellcode|source|projekt|project|aufgabe|praktikum|lab|snippet/i

/** Worth asking the model: a link that hints at code but isn't a known pattern. */
export function maybeRepo(link: string, title = ''): boolean {
  if (NO_CODE.test(link)) return false
  try {
    const u = new URL(link)
    if (u.protocol !== 'https:') return false
    return (
      HINT.test(`${u.hostname} ${u.pathname} ${title}`) && u.pathname.split('/').filter(Boolean).length >= 1
    )
  } catch {
    return false
  }
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Is this link a Git repository? Known patterns first (GitLab/ProjectBase, GitHub …); otherwise –
 * when the local model is set up and the link hints at code – the model decides (once per link).
 */
export function detectRepo(link: string, title = ''): Promise<Repo | null> {
  const known = repoUrl(link)
  if (known) return Promise.resolve(known)
  const prior = cached(link)
  if (prior !== undefined) return Promise.resolve(prior)
  const bridge = electronBridge()?.localModel
  if (!bridge || !localModelAvailable() || !maybeRepo(link, title)) return Promise.resolve(null)
  const run = queue.then(async () => {
    const again = cached(link)
    if (again !== undefined) return again
    const answer = await withAi('Git-Repository erkennen', () =>
      bridge.complete(
        localModelChoice(),
        'You decide whether a link points to a Git repository that can be cloned (GitLab, GitHub, Gitea, Bitbucket, a self-hosted Git server). Answer only with JSON: {"repo": true, "clone": "<https clone URL ending in .git>"} or {"repo": false}.',
        `Link: ${link}\nTitle: ${title}`,
        60,
      ),
    ).catch(() => '')
    let repo: Repo | null = null
    try {
      const json = JSON.parse(/\{[\s\S]*\}/.exec(answer)?.[0] ?? '{}') as { repo?: boolean; clone?: string }
      const clone = json.repo && typeof json.clone === 'string' ? new URL(json.clone) : null
      // Only a clone address on the same server, never somewhere else.
      if (clone && clone.protocol === 'https:' && clone.hostname === new URL(link).hostname) {
        const name = clone.pathname
          .split('/')
          .filter(Boolean)
          .pop()
          ?.replace(/\.git$/, '')
        if (name) repo = { url: clone.toString(), name }
      }
    } catch {
      /* not JSON – not a repository */
    }
    remember(link, repo)
    return repo
  })
  queue = run.catch(() => undefined)
  return run
}

/** The repository behind a link (known pattern at once, the model's answer when it comes). */
export function useRepo(link: string, title = ''): Repo | null {
  const known = repoUrl(link)
  const guess = useGuesses((s) => s[link])
  const prior = known ? undefined : (guess ?? cached(link))
  useEffect(() => {
    if (!known && prior === undefined) void detectRepo(link, title)
  }, [known, prior, link, title])
  return known ?? prior ?? null
}
