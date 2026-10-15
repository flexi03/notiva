import { describe, expect, it } from 'vitest'
import { cleanMessage, explainError } from '../errors'

describe('explainError', () => {
  it('erkennt fehlendes Git (macOS, Windows, Linux) mit Ein-Klick-Fix', () => {
    for (const msg of [
      "Error invoking remote method 'git:state': GitError: Git ist nicht installiert.",
      "'git' is not recognized as an internal or external command",
      'spawn git ENOENT',
    ])
      expect(explainError(new Error(msg))).toMatchObject({ fix: 'installGit' })
  })

  it('erkennt fehlende Git-Identität, Konflikt beim Push und Netzwerkfehler', () => {
    expect(explainError('*** Please tell me who you are.')?.fix).toBe('gitIdentity')
    expect(explainError(' ! [rejected] main -> main (fetch first)')?.fix).toBe('gitPull')
    expect(explainError('getaddrinfo ENOTFOUND mdl.hs-duesseldorf.de', 'en')).toEqual({
      reason: 'No connection to the server – check internet or VPN and try again.',
      fix: 'retry',
    })
  })

  it('lässt Unbekanntes unverändert (null) und säubert Electron-Präfixe', () => {
    expect(explainError('Irgendwas Neues')).toBeNull()
    expect(cleanMessage("Error invoking remote method 'x:y': Error: Kaputt")).toBe('Kaputt')
  })
})
