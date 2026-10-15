/**
 * Keeps session cookies of a login session (university, Microsoft) for some days, like "stay
 * signed in" – only for Notiva's own sessions (eCampus, Moodle/browser), never the app itself.
 */
import type { Session } from 'electron'

export function keepSessionCookies(ses: Session, days = 14): void {
  ses.cookies.on('changed', (_event, cookie, cause, removed) => {
    // Server cookies arrive as "inserted" (Electron ≥ 40) or "explicit"; ours are no session cookies.
    if (removed || !/^(explicit|inserted|overwrite)/.test(cause) || cookie.session === false || !cookie.domain)
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
