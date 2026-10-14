import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Sparkles, Square } from 'lucide-react'
import { loadTranscribeSettings, summarizeLecture, useLecture } from '@/app/lecture/session'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { clock } from '@/lib/lecture/transcript'
import { TRANSCRIBE_PRESETS } from '@/lib/lecture/transcribe'
import { Button, Checkbox, cx } from '@/components/ui'
import type { SideProps } from '@/components/viewer/PdfDocumentView'

async function slideTexts(doc: SideProps['doc']): Promise<string[]> {
  const texts: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    texts.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
  }
  return texts
}

/**
 * Live lecture next to the slides: records, transcribes, follows the lecturer's slide and writes
 * the transcript page; afterwards the assistant summarizes it.
 */
export function LecturePanel({ page, jump, doc, path }: SideProps) {
  const ws = useWorkspace()
  const navigate = useApp((s) => s.navigate)
  const openPage = useApp((s) => s.openPage)
  const lecture = useLecture()
  const mine = lecture.pdfPath === path
  const active =
    mine && (lecture.status === 'recording' || lecture.status === 'paused' || lecture.status === 'starting')
  const busyElsewhere = !mine && (lecture.status === 'recording' || lecture.status === 'paused')
  const settings = loadTranscribeSettings()
  const provider = TRANSCRIBE_PRESETS.find((p) => p.id === settings.preset)?.label ?? settings.preset
  const [keepAudio, setKeepAudio] = useState(false)
  const transcriptEnd = useRef<HTMLDivElement>(null)

  // Follow the lecturer: jump to the detected slide.
  const lastSlide = useRef(lecture.slide)
  useEffect(() => {
    if (!mine || !lecture.follow || lecture.slide === lastSlide.current) return
    lastSlide.current = lecture.slide
    jump(lecture.slide)
  }, [mine, lecture.follow, lecture.slide, jump])

  // Braces matter: scrollIntoView returns a Promise in current Chromium – never return it from an effect.
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [lecture.entries.length])

  const start = async () => {
    const texts = await slideTexts(doc)
    await lecture.start(ws, path, texts, page, keepAudio)
  }

  return (
    <section aria-label={t('lecture.title')} className="border-b border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <Mic size={15} className={cx(active ? 'text-danger' : 'text-ink-3')} aria-hidden />
        <h2 className="flex-1 text-[13px] font-semibold text-ink-2">{t('lecture.title')}</h2>
        {active && (
          <span className="text-[12.5px] text-ink-2 tabular-nums" aria-label={t('lecture.duration')}>
            {clock(lecture.elapsed)}
          </span>
        )}
      </div>

      {!active && lecture.status !== 'finishing' && (
        <>
          <p className="mb-2 text-[12.5px] text-ink-3">{t('lecture.intro', { provider })}</p>
          <label className="mb-2 flex items-center gap-2 text-[12.5px]">
            <Checkbox checked={lecture.follow} onChange={lecture.setFollow} />
            {t('lecture.follow')}
          </label>
          <label className="mb-3 flex items-center gap-2 text-[12.5px]">
            <Checkbox checked={keepAudio} onChange={setKeepAudio} />
            {t('lecture.keepAudio')}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Mic size={14} />}
              disabled={busyElsewhere}
              onClick={() => void start()}
            >
              {t('lecture.start')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate({ name: 'settings' })}>
              {t('lecture.settings')}
            </Button>
          </div>
          {busyElsewhere && <p className="mt-2 text-[12.5px] text-ink-3">{t('lecture.busyElsewhere')}</p>}
        </>
      )}

      {active && (
        <>
          <div
            className="mb-2 h-1.5 overflow-hidden rounded-full bg-sunken"
            role="meter"
            aria-label={t('lecture.level')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(lecture.level * 400)}
          >
            <div
              className="h-full bg-accent transition-[width] duration-100"
              style={{ width: `${Math.min(100, lecture.level * 400)}%` }}
            />
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {lecture.status === 'paused' ? (
              <Button size="sm" icon={<Play size={14} />} onClick={lecture.resume}>
                {t('lecture.resume')}
              </Button>
            ) : (
              <Button
                size="sm"
                icon={<Pause size={14} />}
                onClick={lecture.pause}
                disabled={lecture.status === 'starting'}
              >
                {t('lecture.pause')}
              </Button>
            )}
            <Button
              size="sm"
              variant="danger"
              icon={<Square size={13} />}
              onClick={() => void lecture.stop()}
            >
              {t('lecture.stop')}
            </Button>
          </div>
          <label className="mb-1 flex items-center gap-2 text-[12.5px]">
            <Checkbox
              checked={lecture.follow}
              onChange={(v) => {
                lecture.setFollow(v)
                if (!v) lecture.setSlide(page)
              }}
            />
            {t('lecture.followNow', { page: lecture.slide })}
          </label>
          {!lecture.follow && lecture.slide !== page && (
            <button
              type="button"
              className="text-[12.5px] text-accent hover:underline"
              onClick={() => lecture.setSlide(page)}
            >
              {t('lecture.syncHere', { page })}
            </button>
          )}
          <p className="text-[12px] text-ink-3" aria-live="polite">
            {lecture.status === 'paused'
              ? t('lecture.paused')
              : lecture.pending > 0
                ? t('lecture.transcribing', { count: lecture.pending })
                : t('lecture.listening')}
          </p>
        </>
      )}

      {lecture.status === 'finishing' && mine && (
        <p className="text-[12.5px] text-ink-2">{t('lecture.finishing')}</p>
      )}

      {lecture.error && mine && (
        <p role="alert" className="mt-2 text-[12.5px] text-danger">
          {lecture.error}
        </p>
      )}

      {mine && lecture.entries.length > 0 && (
        <div
          className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-control bg-sunken p-2 text-[12.5px]"
          aria-label={t('lecture.live')}
          role="log"
        >
          {lecture.entries.slice(-30).map((e, i) => (
            <p key={i}>
              <button
                type="button"
                className="mr-1 text-ink-3 tabular-nums hover:text-accent"
                onClick={() => jump(e.page)}
                title={t('lecture.toSlide', { page: e.page })}
              >
                {t('lecture.slideShort', { page: e.page })}
              </button>
              {e.speaker && <span className="font-semibold">{e.speaker}: </span>}
              {e.text}
            </p>
          ))}
          <div ref={transcriptEnd} />
        </div>
      )}

      {mine && lecture.pagePath && (lecture.status === 'done' || active) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => openPage(lecture.pagePath!)}>
            {t('lecture.openTranscript')}
          </Button>
          {lecture.status === 'done' && (
            <Button
              size="sm"
              variant="primary"
              icon={<Sparkles size={14} />}
              onClick={() => summarizeLecture(lecture.pagePath!, path)}
            >
              {t('lecture.summarize')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
