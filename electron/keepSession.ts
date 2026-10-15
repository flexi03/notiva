/**
 * Keeps session cookies of a login session (university, Microsoft) for some days, like "stay
 * signed in" – only for Notiva's own sessions (eCampus, Moodle/browser), never the app itself.
 */
import type { Session } from 'electron'

export function keepSessionCookies(ses: Session, days = 14): void {
  ses.cookies.on('changed', (_event, cookie, cause, removed) => {
    // Server cookies arrive as "inserted" (Electron ≥ 40) or "explicit"; ours are no session cookies.
    if (
      removed ||
      !/^(explicit|inserted|overwrite)/.test(cause) ||
      cookie.session === false ||
      !cookie.domain
    )
      return
    const host = cookie.domain.replace(/^\./, '')
    void ses.cookies
      .set({
        url: `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path ?? '/'}`,
        name: cookie.name,
        value: cookie.value,
        ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
        path: cookie.path ?? '/',
        secure: cookie.secure ?? false,
        httpOnly: cookie.httpOnly ?? false,
        ...(cookie.sameSite ? { sameSite: cookie.sameSite } : {}),
        expirationDate: Date.now() / 1000 + days * 86_400,
      })
      .catch(() => undefined)
  })
}

/**
 * One Microsoft sign-in for eCampus and Moodle: copies the identity provider's cookies from one
 * session (partition) to the other, so the second one signs in silently.
 */
export async function shareMicrosoftCookies(from: Session, to: Session): Promise<number> {
  const cookies = await from.cookies.get({}).catch(() => [])
  let copied = 0
  for (const c of cookies) {
    const host = (c.domain ?? '').replace(/^\./, '')
    if (!/(^|\.)(login\.microsoftonline\.com|login\.live\.com|microsoftonline\.com)$/i.test(host)) continue
    await to.cookies
      .set({
        url: `https://${host}${c.path ?? '/'}`,
        name: c.name,
        value: c.value,
        ...(c.hostOnly ? {} : { domain: c.domain }),
        path: c.path ?? '/',
        secure: c.secure ?? true,
        httpOnly: c.httpOnly ?? false,
        ...(c.sameSite ? { sameSite: c.sameSite } : {}),
        ...(c.expirationDate ? { expirationDate: c.expirationDate } : {}),
      })
      .then(() => copied++)
      .catch(() => undefined)
  }
  return copied
}
