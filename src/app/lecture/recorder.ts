import workletUrl from './pcm-worklet.js?url'
import { Chunker, SAMPLE_RATE, type Chunk } from '@/lib/lecture/audio'
import { electronBridge } from '@/lib/vault'

/**
 * Microphone → 16 kHz mono frames → chunks cut at pauses. Optionally also keeps the whole
 * recording as compressed audio (Opus/WebM) to save next to the transcript.
 */
export class LiveRecorder {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private chunker: Chunker
  private paused = false
  private pausedAt = 0
  private media: MediaRecorder | null = null
  private parts: Blob[] = []

  constructor(
    onChunk: (chunk: Chunk) => void,
    private readonly onLevel: (level: number) => void,
  ) {
    this.chunker = new Chunker(onChunk)
  }

  async start(keepAudio: boolean): Promise<void> {
    if (electronBridge()?.microphone && !(await electronBridge()!.microphone!()))
      throw new Error(
        'Kein Zugriff auf das Mikrofon – in den Systemeinstellungen unter Datenschutz → Mikrofon erlauben.',
      )
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Dieser Browser kann nicht aufnehmen.')
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    })
    this.context = new AudioContext({ sampleRate: SAMPLE_RATE })
    await this.context.audioWorklet.addModule(workletUrl)
    const source = this.context.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.context, 'notiva-pcm-frames')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.paused) return
      this.onLevel(this.chunker.push(e.data))
    }
    source.connect(this.node)
    // The click that started recording may be "used up" by the awaits above: make sure it runs.
    if (this.context.state === 'suspended') await this.context.resume()
    if (keepAudio && typeof MediaRecorder !== 'undefined') {
      const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
      this.media = new MediaRecorder(this.stream, {
        ...(type ? { mimeType: type } : {}),
        audioBitsPerSecond: 32_000,
      })
      this.media.ondataavailable = (e) => e.data.size && this.parts.push(e.data)
      this.media.start(10_000)
    }
  }

  pause(): void {
    if (this.paused) return
    this.paused = true
    this.pausedAt = performance.now()
    this.chunker.flush()
    this.media?.pause()
    this.onLevel(0)
  }

  resume(): void {
    if (!this.paused) return
    this.chunker.skip((performance.now() - this.pausedAt) / 1000)
    this.paused = false
    this.media?.resume()
  }

  /** Ends the recording; resolves with the compressed audio if it was kept. */
  async stop(): Promise<Blob | null> {
    if (!this.paused) this.chunker.flush()
    const audio = await new Promise<Blob | null>((resolve) => {
      if (!this.media || this.media.state === 'inactive') return resolve(null)
      this.media.onstop = () => resolve(new Blob(this.parts, { type: this.media?.mimeType || 'audio/webm' }))
      this.media.stop()
    })
    this.node?.disconnect()
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    await this.context?.close().catch(() => undefined)
    this.onLevel(0)
    return audio
  }
}
