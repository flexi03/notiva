import { create } from 'zustand'
import type { Message } from '@/lib/ai/agent'
import { useApp } from '@/app/store'
import { useAssistant } from '@/app/assistant'

/** One saved conversation with the assistant (on this device, per vault – never in the vault/Git). */
export interface SavedChat {
  id: string
  title: string
  updated: string
  messages: Message[]
  /** AI program session (Claude Code) – continued when the chat is opened again. */
  sessionId: string | null
}

const MAX_CHATS = 40
const storageKey = () => `notiva:chats:${useApp.getState().ws?.vault.name ?? 'default'}`

function load(): SavedChat[] {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) ?? '[]') as unknown
    return Array.isArray(raw) ? (raw as SavedChat[]).filter((c) => c && typeof c.id === 'string') : []
  } catch {
    return []
  }
}

function store(chats: SavedChat[]): void {
  let list = chats.slice(0, MAX_CHATS)
  // Browser storage is small: drop the oldest chats until it fits.
  while (list.length) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(list))
      return
    } catch {
      list = list.slice(0, -1)
    }
  }
}

const titleOf = (messages: Message[]) => {
  const first = messages.find((m) => m.role === 'user')
  const text = first?.parts.map((p) => ('text' in p ? p.text : '')).join(' ') ?? ''
  return text.replace(/\s+/g, ' ').trim().slice(0, 70) || 'Chat'
}

interface ChatsState {
  /** Id of the chat shown in the assistant. */
  current: string
  list: SavedChat[]
  reload(): void
  /** Saves the assistant's conversation under the current id. */
  saveCurrent(): void
  open(id: string): void
  startNew(): void
  remove(id: string): void
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

export const useChats = create<ChatsState>((set, get) => ({
  current: newId(),
  list: [],
  reload: () => set({ list: load() }),
  saveCurrent() {
    const { messages, sessionId } = useAssistant.getState()
    if (!messages.length) return
    const chat: SavedChat = {
      id: get().current,
      title: titleOf(messages),
      updated: new Date().toISOString(),
      messages,
      sessionId,
    }
    const list = [chat, ...load().filter((c) => c.id !== chat.id)]
    store(list)
    set({ list })
  },
  open(id) {
    get().saveCurrent()
    const chat = load().find((c) => c.id === id)
    if (!chat) return
    useAssistant.getState().reset()
    useAssistant.setState({ messages: chat.messages, sessionId: chat.sessionId })
    set({ current: id, list: load() })
  },
  startNew() {
    get().saveCurrent()
    useAssistant.getState().reset()
    set({ current: newId(), list: load() })
  },
  remove(id) {
    const list = load().filter((c) => c.id !== id)
    store(list)
    set({ list })
    if (id === get().current) {
      useAssistant.getState().reset()
      set({ current: newId() })
    }
  },
}))

/** Saves the conversation whenever an answer is complete (busy → idle). */
let wasBusy = false
useAssistant.subscribe((state) => {
  if (wasBusy && !state.busy) useChats.getState().saveCurrent()
  wasBusy = state.busy
})
