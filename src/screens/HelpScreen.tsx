import { useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Bell,
  ChevronDown,
  FileDiff,
  PanelBottom,
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
import { useApp, type ViewId } from '@/app/store'
import { getLanguage } from '@/i18n'
import type { Route } from '@/lib/route'
import { Button, cx } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

/**
 * "So funktioniert Notiva": how the parts of a study folder relate and where to find what.
 * Kept in sync with docs/ANLEITUNG.md / docs/GUIDE.en.md – change both together.
 */
export function HelpScreen() {
  const de = getLanguage() === 'de'
  const text = de ? DE : EN
  const [openPlace, setOpenPlace] = useState<number | null>(null)
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
        <p className="mb-2 text-[13px] text-ink-3">{text.whereHint}</p>
        <div className="mb-8 grid gap-2 sm:grid-cols-2">
          {text.places.map((p, i) => (
            <Place
              key={p.title}
              {...p}
              open={openPlace === i}
              onToggle={() => setOpenPlace(openPlace === i ? null : i)}
              openLabel={text.open}
            />
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
  /** The detailed explanation (shown when the place is clicked). */
  details: string[]
  route?: Route
  view?: ViewId
}

/** A place in the app: click → the detailed explanation and "Öffnen". */
function Place({
  icon,
  title,
  where,
  what,
  details,
  route,
  view,
  open,
  onToggle,
  openLabel,
}: PlaceInfo & {
  open: boolean
  onToggle: () => void
  openLabel: string
}) {
  const navigate = useApp((s) => s.navigate)
  const id = `help-${title.replace(/\W+/g, '-')}`
  return (
    <div className={cx('rounded-panel border border-line', open && 'bg-sunken/50 sm:col-span-2')}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full gap-3 rounded-panel p-3 text-left hover:bg-hover"
      >
        <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-[12.5px] text-ink-3">{where}</span>
          <span className="block text-[13px] text-ink-2">{what}</span>
        </span>
        <ChevronDown
          size={15}
          className={cx('mt-1 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div id={id} className="space-y-2 px-3 pb-3 pl-10 text-[13.5px] text-ink-2">
          <ul className="list-disc space-y-1 pl-4">
            {details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {(route || view) && (
            <Button
              size="sm"
              variant="primary"
              icon={<ArrowRight size={13} />}
              onClick={() => (route ? navigate(route) : useApp.getState().openView(view!))}
            >
              {openLabel}
            </Button>
          )}
        </div>
      )}
    </div>
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
  whereHint: 'Klick auf einen Punkt für die ausführliche Erklärung.',
  open: 'Öffnen',
  places: [
    {
      icon: <BookOpenCheck size={18} />,
      title: 'Mein Semester',
      where: 'Seitenleiste → Studium',
      what: 'Karten deiner belegten Module: nächster Termin, Prüfung, Aufgaben, neues Skript, Praktikum.',
      details: [
        'Eine Karte je Modul, das du in diesem Semester belegst (Spalte „Belegung“ auf der Modulseite).',
        'Die Karte zeigt den nächsten Termin aus dem Stundenplan, die nächste Prüfung, offene Aufgaben und das neueste Skript.',
        '„Praktikum bearbeiten“ öffnet den Code-Ordner des Moduls.',
      ],
      route: { name: 'semester' },
    },
    {
      icon: <CalendarClock size={18} />,
      title: 'Stundenplan',
      where: 'Seitenleiste → Studium',
      what: 'Wochenansicht; „Zeiten vorschlagen“ findet Termine in Moodle und den Einführungsfolien.',
      details: [
        'Die Termine stehen in der Datenbank „Stundenplan“ – je Zeile Tag, Beginn, Ende, Typ, Raum und Modul.',
        '„Zeiten vorschlagen“ sucht in den Moodle-Texten und den ersten Seiten der Einführungs-PDFs. Jeder Vorschlag sagt, wo er gefunden wurde (Kurs oder Folie und Seite) – du entscheidest.',
        'Die Quelle bleibt in der Spalte „Quelle“ und erscheint beim Darüberfahren im Wochenplan.',
        'Auf der Modulseite stehen die Termine des Moduls mit „Termin hinzufügen“ und „Zeiten suchen“.',
        'Ein Klick auf „Als Nächstes“ unten öffnet das Modul und hebt die Dateien für den Termin hervor.',
      ],
      route: { name: 'timetable' },
    },
    {
      icon: <GraduationCap size={18} />,
      title: 'Moodle',
      where: 'Seitenleiste → Studium',
      what: 'Alle Kurse mit Unterlagen, Terminen und Ankündigungen; „Unterlagen neu einlesen“.',
      details: [
        'Kurse öffnen sich in Notiva; Unterlagen speicherst du mit einem Klick in Unterlagen/<Modul>.',
        'Links (z. B. ProjectBase) öffnen im Browser – dort klappt die Anmeldung mit 2FA – oder in einem App-Fenster.',
        'Bei Git-Projekten holt „Repository ins Praktikum holen“ den Code in den Praktikumsordner (mit Fortschritt).',
        '„Unterlagen neu einlesen“ vergleicht Moodle mit deinem Ordner: falsch einsortierte Dateien (Notizen wandern mit), fehlende und neuere Versionen – nur Angehaktes passiert.',
        'Liegt eine Datei schon in deinem Ordner (gleicher Name, gleiche Größe), heißt es „Zuordnen“ statt Herunterladen. Kurse auf „nicht berücksichtigen“ bleiben still, „anderes Semester“ meldet sich nur grau.',
      ],
      route: { name: 'moodle' },
    },
    {
      icon: <FileDiff size={18} />,
      title: 'Neue Versionen',
      where: 'Moodle → „N neue Version(en)“ oder Hinweis „Vergleichen“',
      what: 'Neuere Fassungen eines Skripts vergleichen und entscheiden: ersetzen oder beide behalten.',
      details: [
        'Eine neuere Fassung aus Moodle überschreibt nie deine Datei – sie kommt als „<Name> (neu <Datum>).pdf“ daneben.',
        'Der Vergleich geht Seite für Seite: geänderte Seiten gelb, neue grün, entfernte werden aufgezählt; die passenden Seiten stehen nebeneinander.',
        '„Alte ersetzen“: die neue Fassung bekommt den alten Namen, Notizen bleiben verknüpft. „Beide behalten“: die neue bleibt mit Datum daneben.',
      ],
      route: { name: 'versions' },
    },
    {
      icon: <School size={18} />,
      title: 'Studium & Hochschule',
      where: 'Einstellungen → Studium',
      what: 'Studium anlegen/abgleichen, Moodle und eCampus verbinden, andere Hochschule einrichten.',
      details: [
        'Der Abgleich holt Module aus der Prüfungsordnung, Kurse aus Moodle und Noten/Prüfungen aus dem eCampus.',
        'Du siehst vorher, was sich ändert, und bestätigst – nichts passiert still.',
        'Andere Hochschule: Moodle-Adresse eintragen, Module selbst anlegen.',
      ],
      route: { name: 'settings', section: 'study' },
    },
    {
      icon: <SquareTerminal size={18} />,
      title: 'Praktikum',
      where: 'Mein Semester → „Praktikum bearbeiten“ oder Modulseite → „Code-Ordner“',
      what: 'Code-Ordner des Moduls mit Editor, Terminal, Git und den Moodle-Links daneben.',
      details: [
        'Ein Code-Ordner ist eine Seite mit eigenem Ordner – öffnen im Editor (VS Code), im Finder oder im Terminal.',
        'Die Links des Kurses stehen darunter; Git-Projekte holst du mit „Repository ins Praktikum holen“.',
        'Verlangt das Repository eine Anmeldung, holt „Im Terminal holen“ es dort (Git fragt nach Benutzername und Token).',
        '„Termine planen“ auf der Modulseite trägt Vorbereitung und Praktikumstermine mit Erinnerung ein – vorgeschlagen aus Stundenplan und Praktikumsblättern.',
      ],
    },
    {
      icon: <FileText size={18} />,
      title: 'Skripte anmerken',
      where: 'PDF öffnen',
      what: 'Markieren, kommentieren, zeichnen; Seitennotizen in der Spalte rechts; Vorlesungsmodus.',
      details: [
        'Text markieren und Farbe wählen; Kommentare hängen an der Stelle.',
        'Notizen und Markierungen stehen in „<Datei> (Notizen).md“ neben dem PDF – das PDF bleibt unverändert.',
        'Der Vorlesungsmodus zeigt Folie und Notizen nebeneinander.',
      ],
    },
    {
      icon: <Sparkles size={18} />,
      title: 'KI-Assistent',
      where: 'Werkzeugleiste ✨ oder ⌘J',
      what: 'Fragen zur offenen Seite oder Folie; lokal oder mit Claude Code, Codex, Ollama.',
      details: [
        'Kontext umschalten: nur die aktuelle Seite oder das ganze PDF.',
        'Das lokale Modell läuft ohne Internet auf deinem Rechner; einrichten unter Einstellungen → KI.',
      ],
      view: 'assistant',
    },
    {
      icon: <Bell size={18} />,
      title: 'Benachrichtigungen & Vorschläge',
      where: 'Werkzeugleiste rechts oder Statusleiste „N Vorschläge“',
      what: 'Neues aus Moodle/eCampus, Vorschläge zum Bestätigen, Anmeldung erneuern.',
      details: [
        'Jede Prüfung meldet, was sie gefunden hat und was davon neu ist – farbig nach Art.',
        'Vorschläge (Studium, Stundenplan, Unterlagen) warten hier, bis du sie ansiehst und entscheidest.',
        'Sync-Symbol: wann zuletzt und als Nächstes geprüft wird.',
      ],
      view: 'notifications',
    },
    {
      icon: <PanelBottom size={18} />,
      title: 'Statusleiste',
      where: 'Unten am Fensterrand',
      what: 'Nächster Termin, Bestätigungen, Fortschritt, Vorschläge, Hilfe, Version, „Problem melden“.',
      details: [
        'Links der nächste Termin; daneben kurze Bestätigungen („Gespeichert“).',
        'Laufende Aufgaben zeigen Balken, Anzahl und Restzeit – ein Klick öffnet die Liste. Fehler öffnen sich selbst, mit Grund und Knopf zum Beheben.',
        'Rechts: offene Vorschläge, Hilfe, Version (Klick: Info und Updates) und „Problem melden“.',
      ],
    },
    {
      icon: <GitBranch size={18} />,
      title: 'Änderungen (Git)',
      where: 'Werkzeugleiste oder ⌘⇧G',
      what: 'Was sich geändert hat, Commit mit automatischer Zusammenfassung, Push/Pull.',
      details: [
        'Das lokale Modell fasst jede geänderte Datei zusammen und schlägt die Commit-Nachricht vor – du kannst sie ändern.',
        'Große Commits zeigen Fortschritt mit Anzahl und Restzeit.',
        '„Alle verwerfen“ setzt die ausgewählten Änderungen zurück; neue Dateien kommen in den Papierkorb und lassen sich zurückholen.',
      ],
      view: 'git',
    },
    {
      icon: <Inbox size={18} />,
      title: 'Ablage',
      where: 'Werkzeugleiste, unten',
      what: 'Dateien und Text schnell ablegen; in Seiten ziehen, um sie zu verlinken.',
      details: ['Alles, was du hier ablegst, bleibt, bis du es in eine Seite ziehst oder löschst.'],
      view: 'shelf',
    },
    {
      icon: <FolderTree size={18} />,
      title: 'Dateien',
      where: 'Seitenleiste „Seiten“',
      what: 'Dein Ordner als Baum – alles normale Markdown-Dateien.',
      details: [
        'Zuletzt geöffnete Dateien stehen oben in der Seitenleiste.',
        'Mehrere wählen mit ⌘/Strg- oder Shift-Klick, per Drag & Drop verschieben, mit Entf in den Papierkorb.',
        'Oben steht der ganze Pfad; ein Klick auf einen Ordner zeigt seinen Inhalt.',
        'Seiten sind .md-Dateien; du kannst sie auch mit jedem anderen Editor bearbeiten.',
      ],
    },
    {
      icon: <Settings size={18} />,
      title: 'Einstellungen',
      where: '⌘, oder Zahnrad',
      what: 'Allgemein, Studium, Benachrichtigungen, KI, Speicher – mit Erklärung bei jeder Option.',
      details: ['Jede Option erklärt, was sie bewirkt.'],
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
  whereHint: 'Click a place for the detailed explanation.',
  open: 'Open',
  places: [
    {
      ...DE.places[0]!,
      title: 'My semester',
      where: 'Sidebar → Studies',
      what: 'Cards of your modules: next session, exam, tasks, new script, lab.',
      details: [
        'One card per module you take this term (column "Belegung" on the module page).',
        'The card shows the next session from the timetable, the next exam, open tasks and the newest script.',
        '"Work on the lab" opens the module’s code folder.',
      ],
    },
    {
      ...DE.places[1]!,
      title: 'Timetable',
      where: 'Sidebar → Studies',
      what: 'Week view; "Suggest times" finds sessions in Moodle and the intro slides.',
      details: [
        'Sessions live in the "Stundenplan" database – per row day, start, end, type, room and module.',
        '"Suggest times" searches the Moodle texts and the first pages of intro PDFs. Each suggestion says where it was found (course or slide and page) – you decide.',
        'The source stays in the "Quelle" column and shows when you hover the week view.',
        'The module page lists its sessions with "Add session" and "Find times".',
        'A click on "Next" at the bottom opens the module and highlights the files for the session.',
      ],
    },
    {
      ...DE.places[2]!,
      title: 'Moodle',
      where: 'Sidebar → Studies',
      what: 'All courses with materials, dates and announcements; "Re-read materials".',
      details: [
        'Courses open in Notiva; save materials with one click into Unterlagen/<module>.',
        'Links (e.g. ProjectBase) open in the browser – sign-in with 2FA works there – or in an app window.',
        'For Git projects, "Get repository into the lab" clones the code into the lab folder (with progress).',
        '"Re-read materials" compares Moodle with your folder: misplaced files (notes move along), missing ones and newer versions – only what you tick happens.',
        'A file already in your folder (same name, same size) is offered as "Assign" instead of a download. Courses set to "not counted" stay silent, "another semester" only reports in grey.',
      ],
    },
    {
      ...DE.places[3]!,
      title: 'New versions',
      where: 'Moodle → "N new version(s)" or the hint "Compare"',
      what: 'Compare newer versions of a script and decide: replace or keep both.',
      details: [
        'A newer version from Moodle never overwrites your file – it goes next to it as "<name> (neu <date>).pdf".',
        'The comparison goes page by page: changed pages yellow, new ones green, removed ones listed; matching pages side by side.',
        '"Replace old": the new version takes the old name, notes stay linked. "Keep both": the new one stays next to it with its date.',
      ],
    },
    {
      ...DE.places[4]!,
      title: 'Studies & university',
      where: 'Settings → Studies',
      what: 'Create/sync your studies, connect Moodle and eCampus, set up another university.',
      details: [
        'The sync takes modules from the examination regulations, courses from Moodle and grades/exams from eCampus.',
        'You see what changes first and confirm – nothing happens silently.',
        'Another university: enter the Moodle address, create modules yourself.',
      ],
    },
    {
      ...DE.places[5]!,
      title: 'Lab',
      where: 'My semester → "Work on the lab" or module page → "Code folder"',
      what: 'The module’s code folder with editor, terminal, Git and the Moodle links beside it.',
      details: [
        'A code folder is a page with its own folder – open it in your editor (VS Code), the Finder or the Terminal.',
        'The course links are listed below; get Git projects with "Get repository into the lab".',
        'If the repository needs a login, "Get it in the Terminal" clones it there (Git asks for user name and token).',
        '"Plan dates" on the module page adds preparations and lab dates with reminders – suggested from the timetable and lab sheets.',
      ],
    },
    {
      ...DE.places[6]!,
      title: 'Annotate slides',
      where: 'Open a PDF',
      what: 'Highlight, comment, draw; page notes in the right column; lecture mode.',
      details: [
        'Select text and pick a colour; comments stick to their place.',
        'Notes and highlights live in "<file> (Notizen).md" next to the PDF – the PDF stays unchanged.',
        'Lecture mode shows slide and notes side by side.',
      ],
    },
    {
      ...DE.places[7]!,
      title: 'AI assistant',
      where: 'Tool bar ✨ or ⌘J',
      what: 'Questions about the open page or slide; local or with Claude Code, Codex, Ollama.',
      details: [
        'Switch the context: only the current page or the whole PDF.',
        'The local model runs offline on your computer; set it up in Settings → AI.',
      ],
    },
    {
      ...DE.places[8]!,
      title: 'Notifications & suggestions',
      where: 'Right tool bar or status bar "N suggestions"',
      what: 'News from Moodle/eCampus, suggestions to confirm, sign in again.',
      details: [
        'Every check says what it found and what of it is new – coloured by kind.',
        'Suggestions (studies, timetable, materials) wait here until you look at them and decide.',
        'Sync icon: last and next check.',
      ],
    },
    {
      ...DE.places[9]!,
      title: 'Status bar',
      where: 'Bottom edge of the window',
      what: 'Next session, confirmations, progress, suggestions, help, version, "Report a problem".',
      details: [
        'Left: the next session; next to it short confirmations ("Saved").',
        'Running tasks show a bar, count and time left – a click opens the list. Errors open by themselves, with a reason and a fix button.',
        'Right: open suggestions, help, version (click: about and updates) and "Report a problem".',
      ],
    },
    {
      ...DE.places[10]!,
      title: 'Changes (Git)',
      where: 'Tool bar or ⌘⇧G',
      what: 'What changed, commit with an automatic summary, push/pull.',
      details: [
        'The local model summarises every changed file and suggests the commit message – you can edit it.',
        'Large commits show progress with count and time left.',
        '"Discard all" resets the chosen changes; new files go to the trash and can be brought back.',
      ],
    },
    {
      ...DE.places[11]!,
      title: 'Shelf',
      where: 'Tool bar, at the bottom',
      what: 'Put files and text aside quickly; drag into pages to link them.',
      details: ['Everything you put here stays until you drag it into a page or delete it.'],
    },
    {
      ...DE.places[12]!,
      title: 'Files',
      where: 'Sidebar "Pages"',
      what: 'Your folder as a tree – all plain Markdown files.',
      details: [
        'Recently opened files are listed at the top of the sidebar.',
        'Choose several with ⌘/Ctrl or Shift click, drag them to move, Delete puts them in the trash.',
        'The whole path is at the top; a click on a folder shows what it holds.',
        'Pages are .md files; you can edit them with any other editor too.',
      ],
    },
    {
      ...DE.places[13]!,
      title: 'Settings',
      where: '⌘, or gear',
      what: 'General, studies, notifications, AI, storage – with an explanation for every option.',
      details: ['Every option explains what it does.'],
    },
  ],
  askTitle: 'More questions?',
  ask: 'Ask the AI assistant ("Where do I find …?") – or open an issue on GitHub: github.com/flexi03/notiva/issues.',
}
