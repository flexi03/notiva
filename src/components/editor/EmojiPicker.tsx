import { useState } from 'react'
import { t } from '@/i18n'
import { Button, TextInput } from '@/components/ui'

const EMOJI =
  '📄 📝 📚 🎓 🧠 💡 ✅ 📌 📅 🗓️ ⏰ ⏳ 🎯 🏅 🔥 🚀 📊 📈 🧪 🧮 💻 🛠️ 🗂️ 📁 🧾 ✏️ 🖊️ 📖 📓 🔖 🌱 🌍 🏠 💼 🧑‍🏫 🧑‍💻 🎨 🎵 🏃 🍎 ❤️ ⭐ ⚡ 🔒 🧭 🗒️ 🎉 ☕'.split(
    ' ',
  )

export function EmojiPicker({
  onPick,
  onRemove,
}: {
  onPick: (emoji: string) => void
  onRemove?: () => void
}) {
  const [custom, setCustom] = useState('')
  return (
    <div className="w-72 p-2">
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={e}
            onClick={() => onPick(e)}
            className="flex size-8 items-center justify-center rounded-control text-lg hover:bg-hover"
          >
            {e}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          const value = [...custom.trim()].slice(0, 4).join('')
          if (value) onPick(value)
        }}
      >
        <TextInput
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="🙂"
          aria-label={t('page.addIcon')}
          className="h-8"
        />
        {onRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            {t('page.removeIcon')}
          </Button>
        )}
      </form>
    </div>
  )
}
