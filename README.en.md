# Notiva 📝 – your studies and notes in Markdown

<p align="center">
  <img src="docs/images/hell-dunkel.png" alt="Notiva: study dashboard, light on the left, dark on the right" width="900">
</p>

<p align="center">
  <b>Notes, studies, code and PDF annotations in one place – as Markdown files you own.</b><br>
  A hub for your studies: Moodle, eCampus and the exam schedule connected, an AI assistant if you want one.<br>
  Set up for Hochschule Düsseldorf, adaptable to other universities. For laptop and PC.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-2563eb"></a>
  <img alt="Version 0.1.3" src="https://img.shields.io/badge/Version-0.1.3-16a34a">
  <img alt="macOS, Windows, Linux" src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux-ffffff">
</p>

<p align="center"><a href="README.md">Deutsch</a> · <b>English</b></p>

> The app speaks German and English (_Settings → General → Language_). The screenshots show the German demo.

---

## Contents

- [What is it about?](#what-is-it-about)
- [What Notiva does](#what-notiva-does)
- [Labs with editor and terminal](#labs-with-editor-and-terminal)
- [Read and annotate lecture slides](#read-and-annotate-lecture-slides)
- [A hub with connections and AI](#a-hub-with-connections-and-ai)
- [Key terms](#key-terms)
- [Install and run](#install-and-run)
- [Set up your studies in 5 steps](#set-up-your-studies-in-5-steps)
- [Another university?](#another-university)
- [Try it without your own data](#try-it-without-your-own-data)
- [What the files look like](#what-the-files-look-like)
- [Your data](#your-data)
- [FAQ](#faq)
- [For developers](#for-developers)

---

## What is it about?

At university everything is scattered: slides in Moodle, grades in eCampus, dates in the exam schedule PDF, notes in
one app, lab code in another. Notiva brings it to **one place on your laptop** – as **plain Markdown files in a
folder** you can sync with Git, iCloud or Syncthing and open in any text editor.

- **Notes** are written in an editor like Notion and saved as pure Markdown.
- **Studies**: Notiva reads courses, materials and dates from Moodle, grades and exams from eCampus (HISinOne) and the
  faculty's exam schedule – and builds module pages, a timetable and "My semester" from them.
- **Code**: work on labs with editor and terminal right next to the module.
- **Annotations**: highlight and comment on slides without changing the PDF.
- **AI** if you want it: an assistant that sees what you are working on.

The default is Hochschule Düsseldorf (Germany); other universities are set up on a single page – or by the AI
assistant ([Another university?](#another-university)).

## What Notiva does

<table>
  <tr>
    <td width="33%" align="center"><img src="docs/images/semester.png" alt="My semester" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/praktikum.png" alt="Lab with editor and terminal" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/pdf.png" alt="PDF with highlights and notes" width="280"></td>
  </tr>
  <tr>
    <td valign="top"><b>My semester</b><br>A coloured card per module you take: next session, exam, open tasks, newest script, new materials.</td>
    <td valign="top"><b>Labs</b><br>A code folder per module with editor, terminal and Git – one click from "My semester".</td>
    <td valign="top"><b>Annotate slides</b><br>Highlight, comment, draw, page notes – the PDF itself stays unchanged.</td>
  </tr>
  <tr>
    <td width="33%" align="center"><img src="docs/images/hell.png" alt="Study dashboard, light theme" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/einstellungen.png" alt="Settings with Moodle and eCampus" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/vorlagen.png" alt="Templates" width="280"></td>
  </tr>
  <tr>
    <td valign="top"><b>Study dashboard</b><br>Lecture weeks, grade average, ECTS, next exam, tasks due – light or dark.</td>
    <td valign="top"><b>Connections</b><br>Moodle, eCampus, exam schedule, notifications and AI set up in one place.</td>
    <td valign="top"><b>Templates</b><br>Lecture note, study sheet, study dashboard and more – your own templates are ordinary pages.</td>
  </tr>
</table>

**Also:**

- 📝 **Markdown editor** like Notion: `/` commands, `[[links]]`, tasks, callouts, math, code with a copy button.
- 🎓 **Studies**: modules with status, attempts and grade, ECTS-weighted average, exams, timetable, a "now / next" badge.
- 🗓️ **Timetable** as a week view in module colours – times from Moodle and slides are suggested with their source,
  never entered silently.
- 📚 **Materials per module:** the current course up front (lecture, lab & exercise, other), older terms in the
  archive. Notes on a PDF sit right below it in the sidebar.
- 🔎 **Search in PDFs too:** ⌘K finds text in all scripts and jumps to the page.
- 🗓️ **Study plan backwards from the exam date:** lectures and old exams spread over your study days, the portion
  is in "Today" – missed days move on by themselves.
- 🎯 **Exam preparation and grade calculator:** old exams and sheets with solutions per module to tick off; the grade
  you need for your target average.
- 📱 **Calendar on the phone:** timetable, exams, deadlines and study plan as a subscription via QR code – through
  your Mac, no cloud.
- 💾 **Daily backup** into a backup folder of its own, like Time Machine.
- 📅 **Today:** the day's lectures, exams, labs, due tasks and Moodle deadlines in one overview.
- 📄 **New script versions** go next to your file and are compared page by page – you decide.
- 🎙️ **Lecture mode**: records, transcribes locally with Whisper and follows the slides.
- 🧠 **Local mini model** (llama.cpp + Qwen) for quick summaries like commit messages – offline.
- 🤖 **AI assistant** with visible context (Claude Code, Codex, Ollama, your own keys) and an MCP server.
- 🔔 **Notifications** for new materials, deadlines, grades and cancelled lectures.
- 🌿 **Built-in Git**: changes, diff, commit with an automatic summary, history, push/pull; get lab repositories
  from Moodle links.
- 📥 **Shelf** for files and text put aside quickly.
- 🗂️ **Tables, boards and calendars** for tasks, exams and modules – every row is a Markdown file.

## Labs with editor and terminal

<p align="center">
  <img src="docs/images/praktikum.png" alt="A lab in Notiva: Python file in the editor, the terminal with its output below" width="900">
</p>

Work on lab assignments right next to your notes – no switching between editor, terminal, Moodle and PDF:

- **One click:** in _My semester_ every module with a lab or exercise has a **"Work on the lab"** button. Notiva
  creates a lab folder for the module (with `.gitignore`) and opens it.
- **One working folder, one page per session:** all repositories and your own files live together in the lab
  folder – the terminal starts there, files from earlier sessions are at hand without changing paths. The pages
  P01, P02 … show each session's date, preparation, assignment and preparation sheet and its repository.
- **Get a repository from Moodle:** next to Git links (e.g. ProjectBase/GitLab) there is **"Get repository into the
  lab"** – Notiva suggests the matching session and clones with progress.
- **Editor and terminal:** edit files (Python, Java, SQL, JS, HTML, …) with syntax highlighting, a real terminal in
  the folder below – two side by side if you like. History is kept.
- **Assignment beside it:** the assignment PDF with a terminal below, the course's Moodle pages and links as a web
  page next to the terminal.
- **Built-in Git:** see changes, commit, push – with progress.
- **AI on top:** the assistant can see the open file or PDF page (Claude Code, Codex, Ollama, …).

Terminal and editor are part of the desktop app.

## Read and annotate lecture slides

<p align="center">
  <img src="docs/images/pdf.png" alt="Lecture slides with highlights, a comment, a pen stroke and a page note" width="900">
</p>

- **Highlight and comment:** select text → color; comments stay visibly attached to the text.
- **Draw, text boxes, sticky notes** right on the slide – select, move, delete, `⌘Z`.
- **Page notes** in Markdown (with math) in the column beside it.
- **Search, smooth zoom**, `←`/`→` to turn pages.
- **The PDF stays unchanged:** everything lives in a Markdown page next to it (`Skript (Notizen).md`).
- **Ask the AI** about the current slide or a highlight.

## A hub with connections and AI

Notiva connects what you otherwise open one by one:

| Source            | What Notiva makes of it                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| **Moodle**        | courses, materials (sorted automatically), dates, announcements, cancellations |
| **eCampus**       | grades, attempts, passed modules, exam registrations                           |
| **Exam schedule** | your exam dates (last 30 days and upcoming) in _Prüfungen_                     |
| **Course texts**  | lecture, exercise and lab times in the timetable                               |
| **AI assistant**  | summarizes, answers questions about the slides, sets up other universities     |

The AI is off until you turn it on – and shows what it will see before anything is sent.

## Key terms

| Term           | Meaning                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------- |
| **Folder**     | The folder with your notes (a "vault" elsewhere). Everything in Notiva is a file in it.             |
| **Page**       | A Markdown file. Sub-pages live in a folder of the same name next to it.                            |
| **Property**   | A field in a page's header (frontmatter), e.g. `Status`, `ECTS` or `Note` (grade).                  |
| **Database**   | A page whose sub-pages share properties. Views show them as a table, board and so on.               |
| **Tile**       | A building block on a dashboard: a number, progress, a list or an embedded view.                    |
| **Module**     | A course from the examination regulations. Its page gathers Moodle course, materials, notes, exams. |
| **Belegung**   | What you take in a module right now: lecture, lab, exercise or only the exam.                       |
| **Archiv**     | A module's materials from older terms (`Unterlagen/<Modul>/Archiv/<term>`), greyed out.             |
| **P01, P02 …** | A lab session's page: date, preparation, sheets, repository.                                        |
| **Profile**    | `Studium/Hochschule.md` – your university's addresses and study programme.                          |

Property names in the study template are German (`Note`, `Belegung`, `Prüfungen` …); you can rename them freely.

## Install and run

**Download:** the latest version from [Releases](https://github.com/flexi03/notiva/releases/latest) – macOS (Apple
Silicon, `.dmg`), Windows (`.exe`) or Linux (`.AppImage`).

- **macOS:** drag Notiva to Applications and open it. From 0.2.0 the app is signed with an Apple Developer ID and
  notarized by Apple – it opens without asking. (Older versions: _System Settings → Privacy & Security_ →
  **"Open Anyway"**.)
- **Windows:** Notiva is not signed for Windows. On first start: "Windows protected your PC" → **"More info" → "Run anyway"**.

**Updates:** Notiva looks for new versions on start and every hour, tells you and installs them with one click
("Update now"); manually via _Notiva → Nach Updates suchen …_. _Settings → About_ shows the installed version, the
update state and every version with its news – each one can be installed there (older ones after a warning). What's
new: [CHANGELOG.en.md](CHANGELOG.en.md).

**From source** (requires [Node.js](https://nodejs.org) 24 or newer):

```bash
git clone https://github.com/flexi03/notiva.git
cd notiva
npm install
npm run electron     # desktop app
npm run dev          # or in the browser (without terminal, Git and sign-ins)
```

Installers: `npm run dist:mac`, `npm run dist:win` or `npm run dist:linux` (output in `release/`).

## Set up your studies in 5 steps

1. **Choose a folder.** On first start pick "Choose a folder" and create an empty one, e.g. `Studies`.
2. **Create your studies.** Bottom left "Set up your studies → Set up" → "Create studies" (or _Settings → Studies_).
   Pick programme and first semester – or **"Own programme / other university"** with name and ECTS goal. Notiva
   creates dashboard, semesters, exams, tasks and a timetable.
3. **Check your university.** Open `Studium/Hochschule.md` – see [Another university?](#another-university). For HSD everything fits; for another university enter the
   addresses ([guide](docs/HOCHSCHULE.md), template in [examples/](examples/)) – or ask the AI assistant.
4. **Connect Moodle and eCampus** (desktop app). _Settings → Studies_. You sign in on your university's own page;
   Notiva never stores a password.
5. **Sync.** Click the sync icon in the tool bar → "Sync everything now". Now the **modules** arrive – with status,
   attempts and grades. From then on Notiva checks in the background and tells you what is new.

**No Moodle or eCampus?** Then _Module_ stays empty at first – add your courses there with "+ New" (name, ECTS,
semester, _Belegung_) or list them in `Hochschule.md`. The _Module_ page explains both.

In depth – AI, Git, shortcuts, MCP: [docs/GUIDE.en.md](docs/GUIDE.en.md). In the app, _Help → How Notiva works_
shows how everything fits together and where to find what.

## Another university?

Notiva is set up for Hochschule Düsseldorf but works elsewhere too:

- **Moodle** works with any Moodle address (_Settings → Studies → Moodle_).
- **Grades and exams** come from HISinOne/QIS portals; their addresses live in `Studium/Hochschule.md`.
- **The AI assistant** can fill that page in: "Set Notiva up for University X, our Moodle is …".
- **Something doesn't work?** [Open an issue on GitHub](https://github.com/flexi03/notiva/issues/new?template=hochschule.md)
  (template "Hochschule") so your university gets built in. Please don't post passwords or grades.

## Try it without your own data

On the welcome screen choose **"Try the demo"**. It has a ready study dashboard with sample modules, exams and a
timetable. Nothing is saved.

## What the files look like

```
Studium.md                      ← dashboard (tiles as a YAML block in Markdown)
Studium/Hochschule.md           ← your university profile
Studium/Module.md               ← database: schema and views in the header
Studium/Module/Analysis I.md    ← one row
```

```markdown
---
Status: Bestanden
ECTS: 9
Note: 2.3
Semester: ['[[1. Semester]]']
---

## Inhalte

- Folgen und Reihen
```

Full format: [docs/FORMAT.md](docs/FORMAT.md) (German). A small example folder: [examples/vault](examples/vault).

## Your data

- **Everything stays on your device.** No account, no cloud, no telemetry.
- **Sign-ins** for Moodle and eCampus happen on your university's pages. Notiva only keeps the session, like a browser.
- **AI** is off until you turn it on. The context bar shows what will be sent before you send it.
- **App data** (sessions, notifications, terminal logs) lives in the app's profile folder – not in your notes folder
  and not in this repository.

More: [docs/SECURITY.md](docs/SECURITY.md) (German).

## FAQ

**Can I bring my Notion pages?**
Pages yes: export from Notion as Markdown and open the folder in Notiva. Notion databases export as CSV, which Notiva
does not import automatically yet.

**Does it work at my university?**
Moodle works everywhere. eCampus grades need HISinOne. Addresses, exam schedule and programme are set in
`Studium/Hochschule.md`.

**Why does macOS show no notifications?**
The app is unsigned, so Notiva uses a small helper app called "Notiva". Allow it under _System Settings →
Notifications_; the test button in _Settings → Notifications_ shows the result.

**Do I need AI?**
No. Everything works without it. Free and local: Ollama or LM Studio.

## For developers

```bash
npm run check        # types, lint, unit tests
npm run test:e2e     # Playwright: browser and desktop app (Electron)
npm run screenshots  # images for this README (own build without "demo" labels)
```

Acceptance flows (lecture, lab, each tested; German): [docs/ABLAEUFE.md](docs/ABLAEUFE.md) ·
signing the macOS app: [docs/SIGNIEREN.md](docs/SIGNIEREN.md)

Structure and rules (German): [AGENT.md](AGENT.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DESIGN.md](docs/DESIGN.md) · [docs/SECURITY.md](docs/SECURITY.md) · progress: [PROGRESS.md](PROGRESS.md)

## License

[MIT](LICENSE) © flexi03 – free to use, change and share.
