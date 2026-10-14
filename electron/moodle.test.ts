// @vitest-environment node
import { MoodleClient, parseConnect, parseStoredConfig, siteRoot } from './moodle'

type Handler = (url: URL, body: URLSearchParams) => unknown

/** A fake Moodle: answers token.php / server.php like the real thing. */
function fakeMoodle(handler: Handler, finalUrl?: string) {
  const calls: Array<{ url: string; body: URLSearchParams }> = []
  const fetchFn = async (url: string, init?: RequestInit) => {
    const body = new URLSearchParams((init?.body as URLSearchParams | undefined) ?? '')
    calls.push({ url, body })
    const result = handler(new URL(url), body)
    const response = new Response(typeof result === 'string' ? result : JSON.stringify(result), {
      status: 200,
    })
    Object.defineProperty(response, 'url', { value: finalUrl ?? url })
    return response
  }
  return { client: new MoodleClient(fetchFn), calls }
}

const SITE = 'https://moodle.example.org'

describe('Moodle connection input', () => {
  it('finds the Moodle root from what users paste', () => {
    expect(siteRoot('moodle.example.org')).toBe(SITE)
    expect(siteRoot('https://moodle.example.org/my/')).toBe(SITE)
    expect(siteRoot('https://lms.example.org/moodle/login/index.php')).toBe('https://lms.example.org/moodle')
  })

  it('rejects unsafe or broken input', () => {
    expect(() => siteRoot('http://moodle.example.org')).toThrow('https')
    expect(() => siteRoot('https://user:pw@moodle.example.org')).toThrow('Zugangsdaten')
    expect(() => parseConnect({ mode: 'token', site: SITE, token: 'x"; rm' })).toThrow('Token')
    expect(() => parseConnect({ mode: 'login', site: SITE, username: '', password: 'x' })).toThrow()
    expect(() => parseConnect({ mode: 'calendar', url: 'https://moodle.example.org/calendar' })).toThrow(
      'Kalender-Link',
    )
    expect(siteRoot('http://localhost:8123/')).toBe('http://localhost:8123')
  })

  it('reads stored configs defensively', () => {
    expect(
      parseStoredConfig('{"mode":"webservice","site":"https://x","secret":"t","userId":3}'),
    ).toMatchObject({
      userId: 3,
    })
    expect(parseStoredConfig('{"mode":"evil"}')).toBeNull()
    expect(parseStoredConfig('kaputt')).toBeNull()
  })
})

describe('MoodleClient', () => {
  it('logs in with the mobile app service and keeps only the token', async () => {
    const { client, calls } = fakeMoodle((url, body) => {
      if (url.pathname === '/login/token.php') return { token: 'abc123token456def', privatetoken: 'p' }
      if (body.get('wsfunction') === 'core_webservice_get_site_info')
        return { userid: 7, fullname: 'Alex Beispiel' }
      return {}
    })
    const config = await client.connect({ mode: 'login', site: SITE, username: 'alex', password: 'geheim' })
    expect(config).toEqual({
      mode: 'webservice',
      site: SITE,
      secret: 'abc123token456def',
      userId: 7,
      user: 'Alex Beispiel',
    })
    expect(calls[0]!.body.get('service')).toBe('moodle_mobile_app')
    // The password is sent once (POST body, never in the URL) and not stored.
    expect(calls[0]!.url).not.toContain('geheim')
    expect(JSON.stringify(config)).not.toContain('geheim')
  })

  it('explains Moodle errors', async () => {
    const wrong = fakeMoodle(() => ({ error: 'Invalid login', errorcode: 'invalidlogin' }))
    await expect(
      wrong.client.connect({ mode: 'login', site: SITE, username: 'a', password: 'b' }),
    ).rejects.toThrow('Kalender-Link oder einen Token')
    const off = fakeMoodle(() => ({
      exception: 'moodle_exception',
      errorcode: 'enablewsdescription',
      message: 'x',
    }))
    await expect(
      off.client.connect({ mode: 'token', site: SITE, token: 'abcdefghijklmnop' }),
    ).rejects.toThrow('Kalender-Link')
    const html = fakeMoodle(() => '<html>Login</html>')
    await expect(
      html.client.connect({ mode: 'token', site: SITE, token: 'abcdefghijklmnop' }),
    ).rejects.toThrow('Moodle-Adresse')
  })

  it('refuses redirects to other servers', async () => {
    const { client } = fakeMoodle(() => ({ token: 'x' }), 'https://evil.example/login')
    await expect(client.connect({ mode: 'login', site: SITE, username: 'a', password: 'b' })).rejects.toThrow(
      'anderen Server',
    )
  })

  it('fetches courses, deadlines and grades', async () => {
    const { client, calls } = fakeMoodle((_url, body) => {
      switch (body.get('wsfunction')) {
        case 'core_webservice_get_site_info':
          return { userid: 7, fullname: 'Alex' }
        case 'core_enrol_get_users_courses':
          return [{ id: 42, fullname: 'Lineare Algebra', shortname: 'LA' }]
        case 'core_calendar_get_action_events_by_timesort':
          return { events: [{ id: 1, name: 'Blatt 1 ist fällig', timesort: 1792500000, course: { id: 42 } }] }
        default:
          return { exception: 'x', errorcode: 'nopermission', message: 'no' }
      }
    })
    const snap = await client.fetch({ mode: 'webservice', site: SITE, secret: 'tok', userId: 7 })
    expect(snap.courses).toHaveLength(1)
    expect(snap.events[0]).toMatchObject({ title: 'Blatt 1', course: { name: 'Lineare Algebra' } })
    // Grades are optional: an error there doesn't fail the fetch.
    expect(snap.grades).toEqual([])
    expect(
      calls.find((c) => c.body.get('wsfunction') === 'core_enrol_get_users_courses')!.body.get('userid'),
    ).toBe('7')
  })

  it('reads the calendar link', async () => {
    const ics =
      'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1@x\r\nSUMMARY:Blatt 2 ist fällig\r\nDTSTART:20261020T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR'
    const { client } = fakeMoodle(() => ics)
    const url = `${SITE}/calendar/export_execute.php?userid=7&authtoken=abc&preset_what=all&preset_time=recentupcoming`
    const config = await client.connect(
      parseConnect({ mode: 'calendar', url }) as { mode: 'calendar'; url: string },
    )
    expect(config).toMatchObject({ mode: 'calendar', site: SITE })
    expect((await client.fetch(config)).events[0]!.title).toBe('Blatt 2')
    const notIcs = fakeMoodle(() => '<html/>')
    await expect(notIcs.client.connect({ mode: 'calendar', url })).rejects.toThrow('keinen Kalender')
  })
})
