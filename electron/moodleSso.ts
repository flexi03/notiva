/**
 * Sign-in like the official Moodle app, for universities that log in through Microsoft, Shibboleth
 * & co. (incl. 2FA): Moodle's `admin/tool/mobile/launch.php` runs the normal web login in a
 * window and finally redirects to `moodlemobile://token=<base64>`. The base64 holds
 * "signature:::token:::privatetoken", where signature = md5(site URL + passport) proves the answer
 * belongs to this login attempt.
 */
import { createHash, randomBytes } from 'node:crypto'

export const SSO_SCHEME = 'moodlemobile'

export function newPassport(): string {
  return randomBytes(16).toString('hex')
}

export function launchUrl(site: string, passport: string): string {
  const params = new URLSearchParams({ service: 'moodle_mobile_app', passport, urlscheme: SSO_SCHEME })
  return `${site}/admin/tool/mobile/launch.php?${params}`
}

const md5 = (s: string) => createHash('md5').update(s).digest('hex')

/** Variants Moodle may sign with (its configured wwwroot can differ in scheme or trailing slash). */
function siteVariants(site: string): string[] {
  const bare = site.replace(/\/+$/, '')
  const other = bare.startsWith('https://')
    ? bare.replace('https://', 'http://')
    : bare.replace('http://', 'https://')
  return [bare, `${bare}/`, other, `${other}/`]
}

/** Reads the token from the final redirect; null if the URL is not the answer or not ours. */
export function parseSsoAnswer(
  url: string,
  site: string,
  passport: string,
): { token: string; privateToken?: string } | null {
  const match = new RegExp(`^${SSO_SCHEME}://token=([A-Za-z0-9+/=_-]+)`).exec(url.trim())
  if (!match) return null
  let decoded: string
  try {
    decoded = Buffer.from(match[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
  const [signature, token, privateToken] = decoded.split(':::')
  if (!signature || !token || !/^[a-zA-Z0-9]{16,128}$/.test(token)) return null
  if (!siteVariants(site).some((s) => md5(s + passport) === signature)) return null
  return { token, ...(privateToken ? { privateToken } : {}) }
}

/** Builds the answer like Moodle does (for tests and the fake server). */
export function ssoAnswer(site: string, passport: string, token: string, privateToken = 'p'): string {
  return `${SSO_SCHEME}://token=${Buffer.from(`${md5(site + passport)}:::${token}:::${privateToken}`).toString('base64')}`
}
