// @vitest-environment node
import { launchUrl, newPassport, parseSsoAnswer, ssoAnswer } from './moodleSso'

const SITE = 'https://moodle.example.org'

describe('Moodle app sign-in (SSO)', () => {
  it('starts the launch page of the Moodle app service', () => {
    const url = new URL(launchUrl(SITE, 'abc'))
    expect(url.pathname).toBe('/admin/tool/mobile/launch.php')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      service: 'moodle_mobile_app',
      passport: 'abc',
      urlscheme: 'moodlemobile',
    })
    expect(newPassport()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('reads the token from the final redirect', () => {
    const passport = newPassport()
    expect(parseSsoAnswer(ssoAnswer(SITE, passport, 'abcdef0123456789abcd'), SITE, passport)).toEqual({
      token: 'abcdef0123456789abcd',
      privateToken: 'p',
    })
    // Moodle signs with its own wwwroot – a trailing slash or http/https mix still matches.
    expect(
      parseSsoAnswer(ssoAnswer(`${SITE}/`, passport, 'abcdef0123456789abcd'), SITE, passport),
    ).not.toBeNull()
  })

  it('rejects answers of other login attempts or malformed ones', () => {
    const answer = ssoAnswer(SITE, 'other-passport', 'abcdef0123456789abcd')
    expect(parseSsoAnswer(answer, SITE, 'my-passport')).toBeNull()
    expect(parseSsoAnswer('https://moodle.example.org/', SITE, 'x')).toBeNull()
    expect(parseSsoAnswer('moodlemobile://token=!!!', SITE, 'x')).toBeNull()
    expect(parseSsoAnswer(ssoAnswer(SITE, 'x', 'bad token!'), SITE, 'x')).toBeNull()
  })
})
