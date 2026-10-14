// @vitest-environment node
import { parseAiRequest } from './aiRequest'

describe('parseAiRequest', () => {
  const ok = {
    url: 'http://localhost:11434/v1/chat/completions',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }

  it('accepts http(s) requests with plain headers', () => {
    expect(parseAiRequest(ok)).toEqual(ok)
  })

  it('rejects other schemes, credentials in URLs and odd methods', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://user:pw@example.com',
      'not a url',
    ])
      expect(() => parseAiRequest({ ...ok, url })).toThrow()
    expect(() => parseAiRequest({ ...ok, method: 'DELETE' })).toThrow()
  })

  it('rejects header injection and oversized bodies', () => {
    expect(() => parseAiRequest({ ...ok, headers: { 'x-a': 'b\r\nHost: evil' } })).toThrow()
    expect(() => parseAiRequest({ ...ok, headers: { 'bad header': 'x' } })).toThrow()
    expect(() => parseAiRequest({ ...ok, body: 'x'.repeat(4_000_001) })).toThrow()
    expect(() => parseAiRequest(null)).toThrow()
  })
})
