# Changelog

_Deutsch: [CHANGELOG.md](CHANGELOG.md)_

All versions with downloads: [GitHub Releases](https://github.com/flexi03/notiva/releases).
Notiva checks for a new version on start and every hour and installs it itself if you like.

## 0.2.5 – not released yet

- **Groundwork for the iPhone/iPad app** ([#42](https://github.com/flexi03/notiva/issues/42)): _Settings → Storage &
  data → iPhone & iPad_ pairs a device by QR code (its own key per device). The desktop app then answers encrypted
  requests on your Wi-Fi or via Tailscale – day, timetable, tasks, shelf, pages, PDFs and their notes – with the same
  logic as "Today". Devices can be unpaired one by one.

## 0.2.4 – 2026-10-17

- **Calendar on the phone** (_Settings → Studies_): timetable (weekly until the end of the semester), exams,
  deadlines, labs and study plan as a calendar subscription, e.g. in Apple Calendar. Switch it on, scan the QR code
  with the camera, done. The desktop app offers the address with a secret key on your Wi-Fi or via Tailscale – no
  cloud; "New address" stops old subscriptions. Off by default.
- **Submission status from Moodle:** "Today" shows "not submitted", "draft", "submitted" or "graded 1.7" next to
  assignments; submitted ones are faded. When an assignment is graded you get a notification with grade and
  feedback.
- "Today" and the calendar use the same list of dates – both always show the same.

## 0.2.3 – 2026-10-17

- **Study plan backwards from the exam date** (module page): spreads the current course's lecture slides in their
  order over your study days, the last days are for old and practice exams. You choose the study days (Mon–Fri,
  every day or single weekdays, plus days off). Notiva recalculates every day: what you missed moves to the other
  days. Ticks are shared with the exam preparation.
- **"Study today"** in the day overview: every plan's portion, to tick off right there.
- **Suggestion:** from 5 weeks before an exam Notiva suggests a study plan (notification and hint); on the module
  page: start, "Remind me in 3 days" or "Not for this module".

## 0.2.2 – 2026-10-17

- **Search in PDFs:** ⌘K now also finds text in your scripts and sheets – with file, page and a snippet; a click
  opens the PDF on that page. Notiva reads the PDFs once in the background (with progress) and keeps the text in
  `.notiva/cache/` (not in Git); after that only new or changed ones.
- **Grade calculator** (_Grades_): your average now, with expected grades for open modules, and the grade you need
  in the remaining ECTS for a target average. Works without eCampus too; your guesses stay on the device.
- **Daily backup** (_Settings → Storage & data → Backup_): a complete copy of your folder every day in a backup folder
  of its own (default `~/Documents/Notiva-Backups`), like Time Machine – unchanged files take no space. 14 days and
  one per month are kept. "Back up now", show in Finder, restore as a new folder (nothing is overwritten). Git
  history if you like.
- **Exam preparation** on the module page: old, practice and sample exams and exercise sheets from the materials,
  each with its solution, exam hints, days until the exam and "N of M done" to tick off.

## 0.2.1 – 2026-10-17

- Fixed: moved Moodle files counted as "new" afterwards (Notiva forgot where they were when moving them). That
  is why e.g. "DBS2 - Vorlesung 00" and other scripts you already had were suggested again.
- **Assign files you already have:** if a Moodle file with the same name and size is already in your folder,
  Notiva suggests "Assign" instead of downloading it (in the checklist). Same name, other size: offered as a
  possible new version to compare.
- **Courses set to "later" or "ignore":** nothing comes from ignored courses any more (no files, deadlines,
  announcements). Courses for another semester only report new files as a grey "other semester" note – never as
  materials to save. Also applies to "Read in materials again".
- **Moodle files you deleted** are not suggested again.
- **Side bar:** choose several entries with ⌘/Ctrl (one by one) or Shift (a range), drag them onto a page or folder
  (notes and Moodle bookkeeping move along), move them to the trash together with Delete or right click (with undo).
- **Git:** "Discard all" or "Discard N" for the chosen changes. New files go to the trash instead of being deleted –
  one click brings them back.
- **Path bar like the Finder's:** the whole path for PDFs and other files too; a click on any folder shows what it
  holds, its folder page, "Show in Finder" and "Copy folder path".
- **Shelf** at the bottom of the left activity bar (its own place), can be dragged to the bottom right.
- **Module status "Note ausstehend" (waiting for the grade):** when a module's exam lies in the past and no grade
  is entered yet, the study sync suggests this status (also after a "Prüfung angemeldet" you set yourself).
- Changelog now in English too (this file).

## 0.2.0 – 2026-10-16

A bigger change: modules instead of courses, materials by current/archive, labs with one page per session.

- **Modules instead of courses:** no courses database any more. The module page shows materials
  (`Unterlagen/<Modul>`), Moodle information (description, announcements, cancellations) and everything linked.
  Older folders are converted after asking (#1).
- **Materials** land more reliably in lecture or lab & exercise (#2).
- **Current and archive:** the current course lies directly in the module, older terms under `Archiv/<term>`
  (greyed out, collapsed). Every module page shows its materials separated like this.
- **Side bar:** notes hang under their PDF, files and folders go to the trash by right click (with undo), the open
  page is revealed, a line separates the fixed entries from the list.
- **Acceptance flows:** [docs/ABLAEUFE.md](docs/ABLAEUFE.md) (German) – lecture and lab step by step, every step
  covered by a test.
- **My semester:** coloured module cards side by side with the next date, exam, tasks, newest script (#3).
- **Timetable** as a week view in the side bar (#4).
- **Suggest instead of changing silently:** timetable times and the study sync as suggestions to tick (#5).
- **Sign-in:** "Sign in again" right from the notification, one Microsoft sign-in for eCampus and Moodle (#6).
- **"Next"** opens the day's script or the module with one click (#7).
- **Local mini model** (llama.cpp + Qwen) for commit messages, with download progress (#8).
- **Help:** "How Notiva works" in the app, docs updated (#9).
- **Selection** in the side bar and activity bar as an area instead of a line (#10).
- **Settings** reorganised, with a description per section and "About Notiva" (#11).
- **Status bar** at the bottom like VS Code's:
  - next date, confirmations and progress with count and time left;
  - "N suggestions", help, version and "Report a problem" (#7, #12, #22).
- **AI context:** the current page or the whole PDF via a toggle (#13).
- **Notifications:** every check reports "found – new", coloured by kind. New materials are suggested instead of
  saved silently. Confirmations appear in the status bar instead of above the content (#14, #24).
- **Git:** the local model summarises every changed file and suggests the commit message automatically (#15).
- **Side bar:** one width for all views, a collapsible "Studium" group, up to 8 recently opened files (#16, #23).
- **Help:** a click on a place shows the detailed explanation and "Open" (#17).
- **Timetable:**
  - Suggestions name their source (Moodle course, or slide and page) and are also searched in introduction slides.
  - The module page shows the module's dates (#18).
- **Read in materials again:** re-sort (notes move along), fetch what is missing, put newer versions next to the
  file. "New versions" compares them page by page; then you decide: replace or keep both (#19).
- **Keywords:** "VL" and "P01" are recognised as lecture and lab (#20).
- **External links** (e.g. ProjectBase) open in the browser or in an app window. "Get repository into the lab"
  clones Git projects into the lab folder (#21).
- Fixed: the whole interface could be scrolled out of the window (#25).
- **Module page:**
  - At the top, the dates from the timetable (day, time, type, room, next date, source), editable in place.
  - For labs: preparation and lab dates with date, time and reminder. Notiva suggests them from the timetable and
    the lab sheets it found; you see a preview before anything is entered.
  - "Links from Moodle": Git projects (ProjectBase, snippets too) have "Get repository into the lab" right next to
    the link. If Notiva is not sure about a link, it asks the local model.
- **Sort loose materials:** files lying directly in the module folder go to lecture, lab & exercise or other after
  asking. Slides like "DBS2-10_…" count as lecture.
- **Next** (status bar) opens the module and highlights the files most likely to belong to the date.
- **Git:** the local model writes the commit message while the field shows a loading animation. The template is
  only the fallback, with a note.
- **AI glow** at the bottom edge of the window while an AI is working.
- **Today:** a day overview on every daily note – lectures, exams, labs, due and overdue tasks, Moodle deadlines in
  time order.
- **Module page – Moodle by date:** upcoming deadlines first, then announcements and links, newest first, with term
  and section. Repositories you got open from the link ("In the lab: …").
- **Today – Coming up:** tasks, labs and deadlines of the next 7 days, exams of the next 14.
- **Labs:** one page per lab session (P01, P02 …) with date, preparation, assignment and preparation sheet,
  repositories, Moodle links and your own files. "Sort by lab sessions" creates the pages, moves repositories and
  links the dates – after asking. New repositories ask which session they belong to.
- **Moodle courses per module:** "counts now", "other semester (view only)" or "not counted" – affects the study
  sync, timetable and material suggestions. Links by Moodle section.
- **Timetable suggestions** stay discarded ("Discard all", also when closing the hint).
- **Git:** where the commit message comes from (AI, template, you) with an explanation; history as a graph like in
  VS Code; own "Lab repos" tab; `.DS_Store` and the like are always ignored.
- Fixed: crash "t.map is not a function" on pages with links stored as text; links to PDFs lost their extension.
- **Git:** PDFs and other binary files are no longer compared as text in commits (that could take a minute or
  crash); lab repos with coloured diff and change markers in the editor; "Add remote" with a guide; more precise
  commit descriptions (properties exactly, text changes below).
- **Materials:** one folder per course term for modules with several Moodle courses; shown as current / older
  terms / passed.
- **Labs:** repositories lie in the shared lab folder and are linked to their session (P01 …); description beside
  or above the file, size adjustable by dragging.
- **Path:** a click beside the path at the top shows it in full – copy, edit, open.
- **Private Git projects** with an access token (encrypted in the keychain, per server); snippets are fetched via
  their Git address.
- **Reminders** per task ("2 hours before", "None"); date fields can have a time.
- **PDF:** the gap between pages stays the same while zooming, zooming is smoother, ←/→ turn exactly one page.
- Fixed: "PDFWorker.create – the worker is being destroyed" when opening some PDFs.
- Fixed: under "Unread", a notification disappeared on click before you could see the details.
- **README images** without "Demo" labels: an own screenshot build (`npm run screenshots`), normal builds unchanged.
- **macOS:** signed with a Developer ID and notarized by Apple – opens without asking
  ([docs/SIGNIEREN.md](docs/SIGNIEREN.md), German).

## 0.1.3 – 2026-10-15

- **macOS: "Notiva.app is damaged" fixed.** The app is now signed as a whole (ad hoc) when built. On first start
  macOS only asks "Apple could not verify …" → _System Settings → Privacy & Security → Open Anyway_.
- README: install notes for macOS and Windows.

## 0.1.2 – 2026-10-15

- **Error messages with reason and one-click fix:** known errors (Git missing, Git name/e-mail missing, no
  repository, push rejected, no connection, sign-in expired, no permission, AI not set up …) are explained in plain
  words with the matching button – otherwise "Try again".
- **Git on Windows:** instead of an endless "Loading …" an explanation and "Install Git" (winget; macOS: Command Line
  Tools; otherwise the download page).
- **Windows update repaired:** the installer only runs once Notiva has quit; everything is saved before.
- **Notifications per system:** Windows and Linux no longer show macOS hints; Windows settings open directly,
  notifications carry the app name on Windows.
- **Exam plan:** only dates of the last 30 days and the future are entered.
- **Another university with AI:** the dialog closes, the hint is plainer.
- New README: notes, studies, code, annotations and interfaces in focus; light/dark image.

## 0.1.1 – 2026-10-15

- **Other universities:** when creating, "Own study programme / other university" (name, programme, ECTS goal) –
  without HSD addresses. Studies, Moodle and eCampus show a hint with three ways: open `Hochschule.md`, ask the AI
  assistant, or open an issue on GitHub (template "Hochschule").
- **No modules in advance:** a new study set-up without connected Moodle/eCampus creates no subjects; a hint and a
  guide (import or create yourself) on the _Module_ page.
- **Labs:** "Work on the lab" in _My semester_ opens the module's code folder with editor and terminal.
- **Timetable** from Moodle course texts repaired (single dates, rooms, exercise groups, only what you take).
- **PDF:** smooth zoom towards the mouse, ↑/↓ scroll, ←/→ without animation.
- **Shelf** instead of trash for files and text put aside quickly.
- **Notifications** with the Notiva logo; updates are looked for on start and every hour.
- Fixed: chat titles, hints above dialogs.

## 0.1.0 – 2026-10-15

First published version.

- Pages, databases (table, board, gallery, list, calendar), dashboards and templates as Markdown files
- Studies: Moodle, eCampus (HISinOne), exam plan, modules, grades, timetable, "My semester"; the university can be
  adapted in `Studium/Hochschule.md` (default: HSD)
- PDF viewer with search, smooth zoom, highlights and notes; lecture mode with local transcription
- Code folders with editor and terminal, built-in Git, AI assistant and MCP server
- Shelf for files and text put aside quickly
- Notifications and self-update via GitHub Releases
