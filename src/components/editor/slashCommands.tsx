import {
  Calculator,
  CalendarDays,
  CheckSquare,
  ChevronRightSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  LayoutGrid,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
  Table2,
  Text,
  TriangleAlert,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { t, type MessageKey } from '@/i18n'
import { toIsoDate } from '@/lib/dates'
import { widgetBlock } from '@/lib/widgets'

export interface SlashCommand {
  id: string
  label: MessageKey
  keywords: string
  icon: ReactNode
  /** Text inserted in place of "/query"; "|" marks the cursor. */
  insert?: string
  /** Special commands handled by the editor (open pickers). */
  action?: 'link' | 'view' | 'image'
  /** Insert as a new standalone block (widgets, code …) instead of inline. */
  block?: boolean
}

const TILES_EXAMPLE = `type: tiles
tiles:
  - { type: text, title: Notiz, text: "Kacheln stehen als YAML im Markdown." }
  - { type: link, page: Willkommen }`

export function slashCommands(): SlashCommand[] {
  return [
    {
      id: 'text',
      label: 'slash.text',
      keywords: 'text absatz paragraph',
      icon: <Text size={16} />,
      insert: '|',
    },
    {
      id: 'h1',
      label: 'slash.h1',
      keywords: 'h1 überschrift heading titel',
      icon: <Heading1 size={16} />,
      insert: '# |',
    },
    {
      id: 'h2',
      label: 'slash.h2',
      keywords: 'h2 überschrift heading',
      icon: <Heading2 size={16} />,
      insert: '## |',
    },
    {
      id: 'h3',
      label: 'slash.h3',
      keywords: 'h3 überschrift heading',
      icon: <Heading3 size={16} />,
      insert: '### |',
    },
    {
      id: 'bullet',
      label: 'slash.bullet',
      keywords: 'liste aufzählung bullet ul',
      icon: <List size={16} />,
      insert: '- |',
    },
    {
      id: 'numbered',
      label: 'slash.numbered',
      keywords: 'nummeriert liste ol numbered',
      icon: <ListOrdered size={16} />,
      insert: '1. |',
    },
    {
      id: 'todo',
      label: 'slash.todo',
      keywords: 'todo aufgabe checkbox task',
      icon: <CheckSquare size={16} />,
      insert: '- [ ] |',
    },
    { id: 'quote', label: 'slash.quote', keywords: 'zitat quote', icon: <Quote size={16} />, insert: '> |' },
    {
      id: 'callout',
      label: 'slash.callout',
      keywords: 'hinweis callout info tipp warnung',
      icon: <TriangleAlert size={16} />,
      insert: '> [!tip] |\n> ',
    },
    {
      id: 'toggle',
      label: 'slash.toggle',
      keywords: 'toggle aufklappen details',
      icon: <ChevronRightSquare size={16} />,
      insert: '<details><summary>|</summary>\n\n\n\n</details>',
      block: true,
    },
    {
      id: 'code',
      label: 'slash.code',
      keywords: 'code programm snippet',
      icon: <Code2 size={16} />,
      insert: '```\n|\n```',
      block: true,
    },
    {
      id: 'math',
      label: 'slash.math',
      keywords: 'formel mathe latex math equation',
      icon: <Calculator size={16} />,
      insert: '$$\n|\n$$',
      block: true,
    },
    {
      id: 'table',
      label: 'slash.table',
      keywords: 'tabelle table',
      icon: <Table size={16} />,
      insert: '| Spalte 1 | Spalte 2 |\n| --- | --- |\n| | |',
      block: true,
    },
    {
      id: 'divider',
      label: 'slash.divider',
      keywords: 'trennlinie divider hr linie',
      icon: <Minus size={16} />,
      insert: '---',
      block: true,
    },
    {
      id: 'link',
      label: 'slash.link',
      keywords: 'link seite page verlinken',
      icon: <Link2 size={16} />,
      action: 'link',
    },
    {
      id: 'image',
      label: 'slash.image',
      keywords: 'bild image foto',
      icon: <Image size={16} />,
      action: 'image',
    },
    {
      id: 'date',
      label: 'slash.date',
      keywords: 'datum heute date today',
      icon: <CalendarDays size={16} />,
      insert: `${toIsoDate(new Date())}|`,
    },
    {
      id: 'tiles',
      label: 'slash.tiles',
      keywords: 'kacheln tiles dashboard widget',
      icon: <LayoutGrid size={16} />,
      insert: `${widgetBlock(TILES_EXAMPLE)}|`,
      block: true,
    },
    {
      id: 'view',
      label: 'slash.view',
      keywords: 'datenbank ansicht view database embed',
      icon: <Table2 size={16} />,
      action: 'view',
    },
  ]
}

export function filterCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase().trim()
  if (!q) return commands
  return commands.filter(
    (c) => t(c.label).toLowerCase().includes(q) || c.keywords.includes(q) || c.id.startsWith(q),
  )
}
