import { X } from 'lucide-react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { IconButton } from '@/components/ui'

export function ToastHost() {
  const { toast, dismissToast } = useApp()
  return (
    <div
      aria-live="polite"
      className="no-print pointer-events-none fixed inset-x-0 bottom-10 z-[44] flex justify-center px-4"
    >
      {toast && (
        <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-panel bg-ink px-4 py-2.5 text-sm text-paper shadow-[var(--shadow-pop)]">
          <span className="flex-1">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="rounded px-2 py-0.5 font-bold text-marker hover:bg-white/10"
              onClick={() => {
                toast.action!.run()
                dismissToast()
              }}
            >
              {toast.action.label}
            </button>
          )}
          <IconButton
            size="sm"
            label={t('common.close')}
            onClick={dismissToast}
            className="text-paper/70 hover:bg-white/10 hover:text-paper"
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  )
}
