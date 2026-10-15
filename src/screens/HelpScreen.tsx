import type { ReactNode } from 'react'
import {
  Bell,
  BookOpenCheck,
  CalendarClock,
  FileText,
  FolderTree,
  GitBranch,
  GraduationCap,
  Inbox,
  School,
  Settings,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'
import { useApp } from '@/app/store'
import { getLanguage } from '@/i18n'
import type { Route } from '@/lib/route'
import { Topbar } from '@/components/layout/Topbar'

/**
 * "So funktioniert Notiva": how the parts of a study folder relate and where to find what.
 * Kept in sync with docs/ANLEITUNG.md / docs/GUIDE.en.md – change both together.
 */
export function HelpScreen() {
  const de = getLanguage() === 'de'
  const text = de ? DE : EN
  return (
    <>
      <Topbar title={text.title} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-8 sm:px-10">
        <h1 className="mb-2 text-[2rem] font-bold">{text.title}</h1>
        <p className="mb-6 text-ink-2">{text.intro}</p>

        <h2 className="mb-2 text-lg font-semibold">{text.howTitle}</h2>
        <pre
          aria-label={text.howTitle}
          className="mb-3 overflow-x-auto rounded-panel border border-line bg-sunken p-4 text-[12.5px] leading-relaxed"
        >
          {text.diagram}
        </pre>
        <ul className="mb-8 list-disc space-y-1 pl-5 text-[14px] text-ink-2">
          {text.relations.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>

        <h2 className="mb-2 text-lg font-semibold">{text.whereTitle}</h2>
        <div className="mb-8 grid gap-2 sm:grid-cols-2">
          {text.places.map((p) => (
            <Place key={p.title} {...p} />
          ))}
        </div>

        <h2 className="mb-2 text-lg font-semibold">{text.askTitle}</h2>
        <p className="mb-8 text-[14px] text-ink-2">{text.ask}</p>
      </div>
    </>
  )
}

interface PlaceInfo {
  icon: ReactNode
  title: string
  where: string
  what: string
  route?: Route
}

function Place({ icon, title, where, what, route }: PlaceInfo) {
  const navigate = useApp((s) => s.navigate)
  return (
    <button
      type="button"
      disabled={!route}
      onClick={() => route && navigate(route)}
      className="flex gap-3 rounded-panel border border-line p-3 text-left enabled:hover:bg-hover"
    >
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-[12.5px] text-ink-3">{where}</span>
        <span className="block text-[13px] text-ink-2">{what}</span>
      </span>
    </button>
  )
}

const DIAGRAM_DE = `Moodle ───────┐                      ┌──► Unterlagen/<Modul>/Vorlesung | Praktikum & Übung | Sonstiges
eCampus ──────┼──► Abgleich ──► Modul ├──► Moodle-Infos (Beschreibung, Forum, Ausfälle)
Prüfungsplan ─┘   (Vorschau,      │   ├──► Stundenplan (Zeiten aus den Kurstexten – als Vorschlag)
                   du bestätigst) │   ├──► Prüfungen · Aufgaben · Mitschriften (verknüpfen sich)
                                  │   └──► Code-Ordner fürs Praktikum (Editor + Terminal)
                                  └──► Mein Semester: eine Karte je belegtem Modul`

const DIAGRAM_EN = `Moodle ────────┐                     ┌──► Unterlagen/<module>/Vorlesung | Praktikum & Übung | Sonstiges
eCampus ───────┼──► Sync ──► Module ─┼──► Moodle info (description, forum, cancellations)
Exam schedule ─┘   (preview,    │    ├──► Timetable (times from course texts – as suggestions)
                    you confirm)│    ├──► Exams · tasks · notes (they link to it)
                                │    └──► Code folder for the lab (editor + terminal)
                                └──► My semester: one card per module you take`

const DE = {
  title: 'So funktioniert Notiva',
  intro:
    'Alles ist eine Markdown-Datei in deinem Ordner. Im Studium dreht sich alles um das Modul – es gibt keine eigenen Kursseiten mehr.',
  howTitle: 'Wie alles zusammenhängt',
  diagram: DIAGRAM_DE,
  relations: [
    'Ein Modul ist ein Fach deiner Prüfungsordnung. Seine Seite merkt sich die Moodle-Kurse (aller Semester) und zeigt Unterlagen, Moodle-Infos, Prüfungen, Aufgaben und Mitschriften.',
    'Belegung (Vorlesung, Praktikum, Übung, Prüfung) sagt, was du gerade belegst – davon hängen Mein Semester, Stundenplan-Vorschläge und der Praktikum-Knopf ab.',
    'Unterlagen aus Moodle landen in Unterlagen/<Modul>, sortiert nach Vorlesung, Praktikum & Übung und Sonstiges. Kurse ohne Modul (Orga, Fachschaft) landen in Unterlagen/Orga.',
    'Nichts wird still geändert: Abgleich und Stundenplan schlagen vor, du bestätigst. Fehler kommen mit Grund und einem Knopf zum Beheben.',
    'PDF-Markierungen und Notizen stehen in „<Datei> (Notizen).md“ neben dem PDF – das PDF bleibt unverändert.',
  ],
  whereTitle: 'Wo finde ich was?',
  places: [
    {
      icon: <BookOpenCheck size={18} />,
      title: 'Mein Semester',
      where: 'Seitenleiste',
      what: 'Karten deiner belegten Module: nächster Termin, Prüfung, Aufgaben, neues Skript, Praktikum.',
      route: { name: 'semester' },
    },
    {
      icon: <CalendarClock size={18} />,
      title: 'Stundenplan',
      where: 'Seitenleiste',
      what: 'Wochenansicht; „Zeiten aus Moodle vorschlagen“ findet Termine in den Kurstexten.',
      route: { name: 'timetable' },
    },
    {
      icon: <GraduationCap size={18} />,
      title: 'Moodle',
      where: 'Seitenleiste',
      what: 'Alle Kurse mit Unterlagen, Terminen und Ankündigungen.',
      route: { name: 'moodle' },
    },
    {
      icon: <School size={18} />,
      title: 'Studium & Hochschule',
      where: 'Einstellungen → Studium',
      what: 'Studium anlegen/abgleichen, Moodle und eCampus verbinden, andere Hochschule einrichten.',
      route: { name: 'settings', section: 'study' },
    },
    {
      icon: <SquareTerminal size={18} />,
      title: 'Praktikum',
      where: 'Mein Semester → „Praktikum bearbeiten“',
      what: 'Code-Ordner des Moduls mit Editor, Terminal, Git und den Moodle-Links daneben.',
    },
    {
      icon: <FileText size={18} />,
      title: 'Skripte anmerken',
      where: 'PDF öffnen',
      what: 'Markieren, kommentieren, zeichnen; Seitennotizen in der Spalte rechts; Vorlesungsmodus.',
    },
    {
      icon: <Sparkles size={18} />,
      title: 'KI-Assistent',
      where: 'Werkzeugleiste ✨ oder ⌘J',
      what: 'Fragen zur offenen Seite oder Folie; lokal oder mit Claude Code, Codex, Ollama.',
    },
    {
      icon: <Bell size={18} />,
      title: 'Benachrichtigungen & Sync',
      where: 'Werkzeugleiste rechts',
      what: 'Neues aus Moodle/eCampus, Vorschläge, Anmeldung erneuern; Sync-Symbol: wann zuletzt/als Nächstes geprüft wird.',
    },
    {
      icon: <GitBranch size={18} />,
      title: 'Änderungen (Git)',
      where: 'Werkzeugleiste oder ⌘⇧G',
      what: 'Was sich geändert hat, Commit (Nachricht auf Wunsch vom lokalen Modell), Push/Pull.',
    },
    {
      icon: <Inbox size={18} />,
      title: 'Ablage',
      where: 'Werkzeugleiste',
      what: 'Dateien und Text schnell ablegen; in Seiten ziehen, um sie zu verlinken.',
    },
    {
      icon: <FolderTree size={18} />,
      title: 'Dateien',
      where: 'Seitenleiste „Seiten“',
      what: 'Dein Ordner als Baum – alles normale Markdown-Dateien.',
    },
    {
      icon: <Settings size={18} />,
      title: 'Einstellungen',
      where: '⌘, oder Zahnrad',
      what: 'Allgemein, Studium, Benachrichtigungen, KI, Speicher – mit Erklärung bei jeder Option.',
      route: { name: 'settings' },
    },
  ] satisfies PlaceInfo[],
  askTitle: 'Noch Fragen?',
  ask: 'Frag den KI-Assistenten („Wo finde ich …?“) – oder öffne ein Issue auf GitHub: github.com/flexi03/notiva/issues.',
}

const EN: typeof DE = {
  title: 'How Notiva works',
  intro:
    'Everything is a Markdown file in your folder. In your studies everything revolves around the module – there are no separate course pages.',
  howTitle: 'How it fits together',
  diagram: DIAGRAM_EN,
  relations: [
    'A module is a course of your examination regulations. Its page remembers its Moodle courses (all terms) and shows materials, Moodle info, exams, tasks and notes.',
    'Belegung (lecture, lab, exercise, exam) says what you take right now – My semester, timetable suggestions and the lab button depend on it.',
    'Moodle materials go to Unterlagen/<module>, sorted into Vorlesung, Praktikum & Übung and Sonstiges. Courses without a module go to Unterlagen/Orga.',
    'Nothing changes silently: sync and timetable suggest, you confirm. Errors come with a reason and a button to fix them.',
    'PDF highlights and notes live in "<file> (Notizen).md" next to the PDF – the PDF stays unchanged.',
  ],
  whereTitle: 'Where do I find …?',
  places: [
    {
      ...DE.places[0]!,
      title: 'My semester',
      where: 'Sidebar',
      what: 'Cards of your modules: next session, exam, tasks, new script, lab.',
    },
    {
      ...DE.places[1]!,
      title: 'Timetable',
      where: 'Sidebar',
      what: 'Week view; "Suggest times from Moodle" finds sessions in course texts.',
    },
    {
      ...DE.places[2]!,
      title: 'Moodle',
      where: 'Sidebar',
      what: 'All courses with materials, dates and announcements.',
    },
    {
      ...DE.places[3]!,
      title: 'Studies & university',
      where: 'Settings → Studies',
      what: 'Create/sync your studies, connect Moodle and eCampus, set up another university.',
    },
    {
      ...DE.places[4]!,
      title: 'Lab',
      where: 'My semester → "Work on the lab"',
      what: 'The module’s code folder with editor, terminal, Git and the Moodle links beside it.',
    },
    {
      ...DE.places[5]!,
      title: 'Annotate slides',
      where: 'Open a PDF',
      what: 'Highlight, comment, draw; page notes in the right column; lecture mode.',
    },
    {
      ...DE.places[6]!,
      title: 'AI assistant',
      where: 'Tool bar ✨ or ⌘J',
      what: 'Questions about the open page or slide; local or with Claude Code, Codex, Ollama.',
    },
    {
      ...DE.places[7]!,
      title: 'Notifications & sync',
      where: 'Right tool bar',
      what: 'News from Moodle/eCampus, suggestions, sign in again; sync icon: last/next check.',
    },
    {
      ...DE.places[8]!,
      title: 'Changes (Git)',
      where: 'Tool bar or ⌘⇧G',
      what: 'What changed, commit (message by the local model if you like), push/pull.',
    },
    {
      ...DE.places[9]!,
      title: 'Shelf',
      where: 'Tool bar',
      what: 'Put files and text aside quickly; drag into pages to link them.',
    },
    {
      ...DE.places[10]!,
      title: 'Files',
      where: 'Sidebar "Pages"',
      what: 'Your folder as a tree – all plain Markdown files.',
    },
    {
      ...DE.places[11]!,
      title: 'Settings',
      where: '⌘, or gear',
      what: 'General, studies, notifications, AI, storage – with an explanation for every option.',
    },
  ],
  askTitle: 'More questions?',
  ask: 'Ask the AI assistant ("Where do I find …?") – or open an issue on GitHub: github.com/flexi03/notiva/issues.',
}
