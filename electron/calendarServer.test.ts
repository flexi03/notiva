import { CalendarServer, newToken } from './calendarServer'

describe('CalendarServer', () => {
  it('answers only its secret address, read-only', async () => {
    const server = new CalendarServer()
    const token = newToken()
    await server.start(0, token, '127.0.0.1')
    server.setFeed('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n')
    const base = `http://127.0.0.1:${server.port}`
    try {
      const ok = await fetch(`${base}/cal/${token}.ics`)
      expect(ok.status).toBe(200)
      expect(ok.headers.get('content-type')).toContain('text/calendar')
      expect(await ok.text()).toContain('BEGIN:VCALENDAR')
      expect((await fetch(`${base}/cal/${newToken()}.ics`)).status).toBe(404)
      expect((await fetch(`${base}/`)).status).toBe(404)
      expect((await fetch(`${base}/cal/${token}.ics`, { method: 'POST' })).status).toBe(404)
    } finally {
      await server.stop()
    }
    expect(server.running).toBe(false)
  })
})
