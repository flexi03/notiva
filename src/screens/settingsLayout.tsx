import type { ReactNode } from 'react'

/** Layout pieces of the settings screen (shared by its sections). */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-6">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{label}</p>
        {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
