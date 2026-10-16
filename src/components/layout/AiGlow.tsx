import { useAiActivity } from '@/app/aiActivity'
import { useAssistant } from '@/app/assistant'
import { t } from '@/i18n'

/**
 * While an AI works (assistant, local model): a moving, glowing band along the bottom edge of the
 * window – like Siri or Gemini – so nobody wonders whether something happens.
 */
export function AiGlow() {
  const local = useAiActivity((s) => s.count > 0)
  const label = useAiActivity((s) => s.label)
  const assistant = useAssistant((s) => s.busy)
  if (!local && !assistant) return null
  return (
    <div
      role="status"
      aria-label={label ?? t('ai.working')}
      data-testid="ai-glow"
      className="ai-glow no-print pointer-events-none absolute inset-x-0 bottom-0 z-[46] h-[3px]"
    >
      <span className="ai-glow-band" />
      <span className="ai-glow-haze" />
    </div>
  )
}
