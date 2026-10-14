import {
  describeTranscribeError,
  parseTranscribeSettings,
  parseTranscription,
  transcriptionRequest,
  TRANSCRIBE_PRESETS,
} from '../lecture/transcribe'

const preset = (id: string) => {
  const p = TRANSCRIBE_PRESETS.find((x) => x.id === id)!
  return parseTranscribeSettings({
    preset: id,
    baseUrl: p.baseUrl,
    model: p.model,
    diarize: p.diarize,
    apiKey: 'sk-test',
    language: 'de',
  })
}

describe('transcription requests', () => {
  it('asks diarizing models for speakers and others for timestamps', () => {
    const diarize = transcriptionRequest(preset('openai-diarize'), 'Graphen, Dijkstra')
    expect(diarize.url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(diarize.headers).toEqual({ authorization: 'Bearer sk-test' })
    expect(diarize.fields).toEqual({
      model: 'gpt-4o-transcribe-diarize',
      language: 'de',
      response_format: 'diarized_json',
      chunking_strategy: 'auto',
    })
    expect(transcriptionRequest(preset('openai'), 'Dijkstra').fields).toMatchObject({
      response_format: 'json',
      prompt: 'Dijkstra',
    })
    expect(transcriptionRequest(preset('groq')).fields.response_format).toBe('verbose_json')
    expect(transcriptionRequest(parseTranscribeSettings({ preset: 'local-server' })).headers).toEqual({})
  })

  it('validates stored settings', () => {
    expect(parseTranscribeSettings({ baseUrl: 'file:///etc', language: 'evil', model: '' })).toMatchObject({
      baseUrl: 'http://127.0.0.1:8080/v1',
      language: 'de',
      model: 'large-v3-turbo-q5_0',
    })
  })
})

describe('transcription answers', () => {
  it('reads speakers and shifts times to the recording', () => {
    expect(
      parseTranscription(
        {
          text: '…',
          segments: [
            { speaker: 'A', start: 0, end: 4.2, text: ' Heute geht es um Graphen. ' },
            { speaker: 'B', start: 4.5, end: 7, text: 'Ist das klausurrelevant?' },
          ],
        },
        60,
        80,
      ),
    ).toEqual([
      { start: 60, end: 64.2, text: 'Heute geht es um Graphen.', speaker: 'A' },
      { start: 64.5, end: 67, text: 'Ist das klausurrelevant?', speaker: 'B' },
    ])
  })

  it('joins whisper.cpp segments that were cut inside a word', () => {
    // Real answer of whisper-server (shortened).
    const answer = {
      text: ' Bei der Breitensuche gehen wir Ebene für Ebene vor. Die L\naufzeit ist O von V plus E.',
      segments: [
        { text: ' Bei der Breitensuche gehen wir Ebene für Ebene vor. Die L', start: 0, end: 3.69 },
        { text: 'aufzeit ist O von V plus E.', start: 3.69, end: 6.2 },
        { text: ' Gibt es dazu Fragen?', start: 6.3, end: 7.3 },
      ],
    }
    expect(parseTranscription(answer, 0, 8).map((s) => s.text)).toEqual([
      'Bei der Breitensuche gehen wir Ebene für Ebene vor. Die Laufzeit ist O von V plus E.',
      'Gibt es dazu Fragen?',
    ])
  })

  it('handles plain text and drops typical Whisper hallucinations', () => {
    expect(parseTranscription({ text: 'Die Breitensuche nutzt eine Queue.' }, 10, 30)).toEqual([
      { start: 10, end: 30, text: 'Die Breitensuche nutzt eine Queue.' },
    ])
    expect(parseTranscription({ text: 'Untertitel im Auftrag des ZDF, 2021' }, 0, 20)).toEqual([])
    expect(parseTranscription({ text: 'Vielen Dank.' }, 0, 20)).toEqual([])
    expect(parseTranscription('kaputt', 0, 1)).toEqual([])
  })

  it('explains errors', () => {
    const local = parseTranscribeSettings({ preset: 'local-server' })
    expect(describeTranscribeError(0, '', local)).toContain('läuft er?')
    expect(describeTranscribeError(0, 'Modell fehlt', parseTranscribeSettings({ preset: 'local' }))).toBe(
      'Modell fehlt',
    )
    expect(describeTranscribeError(401, '', preset('openai'))).toContain('API-Schlüssel')
    expect(describeTranscribeError(400, '{"error":{"message":"bad audio"}}', local)).toContain('bad audio')
  })
})
