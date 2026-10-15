# Notiva 📝 – notes, databases and your studies as Markdown files

<p align="center">
  <img src="docs/images/dashboard.png" alt="Notiva: study dashboard with lecture weeks, grade average, ECTS and next exam" width="900">
</p>

<p align="center">
  <b>Like Notion – but local, free and in files you own.</b><br>
  Pages, databases, dashboards and a full study planner with Moodle, eCampus and the exam schedule.<br>
  No account, no cloud, no tracking. As a desktop app and as a web app for your phone.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-2563eb"></a>
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/Version-0.1.0-16a34a">
  <img alt="macOS, Windows, Linux, browser" src="https://img.shields.io/badge/macOS%20%7C%20Windows%20%7C%20Linux%20%7C%20Browser-ffffff">
</p>

> The app speaks German and English (_Settings → General → Language_). The screenshots show the German demo.

<p align="center"><a href="README.md">Deutsch</a> · <b>English</b></p>

---

## Contents

- [What is it about?](#what-is-it-about)
- [What Notiva does](#what-notiva-does)
- [Key terms](#key-terms)
- [Install and run](#install-and-run)
- [Set up your studies in 5 steps](#set-up-your-studies-in-5-steps)
- [Try it without your own data](#try-it-without-your-own-data)
- [What the files look like](#what-the-files-look-like)
- [Your data](#your-data)
- [FAQ](#faq)
- [For developers](#for-developers)

---

## What is it about?

Notion is handy, but your notes live on someone else's servers and little works offline. Notiva does the same with
**plain Markdown files in a folder on your device**. Sync the folder with iCloud, Syncthing or Git, open it in any
text editor and take it with you.

On top of that there is a **study mode**: Notiva fetches courses, materials and dates from Moodle, grades and exams
from eCampus (HISinOne) and the faculty's exam schedule. From that it builds module pages, a timetable and
"My semester". The default is Hochschule Düsseldorf (Germany); other universities are configured on a single page
([docs/HOCHSCHULE.md](docs/HOCHSCHULE.md), German).

## What Notiva does

<table>
  <tr>
    <td width="33%" align="center"><img src="docs/images/datenbank.png" alt="Database table view" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/semester.png" alt="My semester" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/vorlagen.png" alt="Templates" width="280"></td>
  </tr>
  <tr>
    <td valign="top"><b>Databases</b><br>Table, board, gallery, list and calendar. Properties, formulas, relations, filters, groups – every row is a Markdown file.</td>
    <td valign="top"><b>My semester</b><br>Every module you are taking now: lectures, new files, annotated PDFs, notes and code.</td>
    <td valign="top"><b>Templates</b><br>Study dashboard, lecture note, study sheet, projects and more. Your own templates are ordinary pages.</td>
  </tr>
  <tr>
    <td width="33%" align="center"><img src="docs/images/einstellungen.png" alt="Settings" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/hell.png" alt="Light theme" width="280"></td>
    <td width="33%" align="center"><img src="docs/images/willkommen.png" alt="Welcome screen" width="280"></td>
  </tr>
  <tr>
    <td valign="top"><b>Settings</b><br>Moodle, eCampus, notifications, AI, storage, colors, font, language.</td>
    <td valign="top"><b>Light & dark</b><br>Follows the system or set it yourself – light here, dark above.</td>
    <td valign="top"><b>Your storage</b><br>A folder on your device, private browser storage (also iPhone/iPad) or a demo.</td>
  </tr>
</table>

**Also:**

- 📝 **Block editor** like Notion, but every block is real Markdown: `/` commands, `[[links]]`, tasks, callouts,
  math, code with a copy button.
- 🧩 **Dashboards** with tiles: numbers, progress, countdown, lists, embedded views.
- 🎓 **Studies**: modules with status, attempts and grade, ECTS-weighted average, exams, timetable, a "now / next" badge.
- 📄 **PDF viewer** with search, smooth zoom, highlights, comments and page notes.
- 🎙️ **Lecture mode**: records, transcribes locally with Whisper and follows the slides.
- 💻 **Code folders** per page with editor, terminal and Git.
- 🤖 **AI if you want it**: an assistant with visible context (Claude Code, Codex, Ollama, your own keys) and an MCP
  server for Claude Desktop & co. – with guarded tools.
- 🌿 **Built-in Git**: changes, diff, commit, history, push/pull.
- 🔔 **Notifications** for new materials, deadlines, grades and cancelled lectures.

## Key terms

| Term         | Meaning                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------- |
| **Folder**   | The folder with your notes (a "vault" elsewhere). Everything in Notiva is a file in it.             |
| **Page**     | A Markdown file. Sub-pages live in a folder of the same name next to it.                            |
| **Property** | A field in a page's header (frontmatter), e.g. `Status`, `ECTS` or `Note` (grade).                  |
| **Database** | A page whose sub-pages share properties. Views show them as a table, board and so on.               |
| **Tile**     | A building block on a dashboard: a number, progress, a list or an embedded view.                    |
| **Module**   | A course from the examination regulations. Its page gathers Moodle course, materials, notes, exams. |
| **Belegung** | What you take in a module right now: lecture, lab, exercise or only the exam.                       |
| **Profile**  | `Studium/Hochschule.md` – your university's addresses and study programme.                          |

Property names in the study template are German (`Note`, `Belegung`, `Prüfungen` …); you can rename them freely.

## Install and run

**Download:** the latest version from [Releases](https://github.com/flexi03/notiva/releases/latest) – macOS (Apple
Silicon, `.dmg`), Windows (`.exe`) or Linux (`.AppImage`). The app is unsigned: on a Mac right-click → Open the first
time, on Windows "More info → Run anyway".

**Updates:** Notiva looks for new versions on start and every hour, tells you and installs them with one click
("Update now"); manually via _Notiva → Nach Updates suchen …_. What's new: [CHANGELOG.md](CHANGELOG.md).

**From source** (requires [Node.js](https://nodejs.org) 24 or newer):

```bash
git clone https://github.com/flexi03/notiva.git
cd notiva
npm install
npm run electron     # desktop app
npm run dev          # or: web app at http://localhost:5173
```

Installers: `npm run dist:mac`, `npm run dist:win` or `npm run dist:linux` (output in `release/`). They are unsigned;
on macOS right-click → Open the first time.

On your phone: open the web app in the browser → "Add to Home Screen".

## Set up your studies in 5 steps

1. **Choose a folder.** On first start pick "Choose a folder" and create an empty one, e.g. `Studies`.
2. **Create the study folder.** _Templates → Studien-Dashboard → Use_. Enter programme, ECTS goal and lecture period.
   Notiva creates modules, semesters, exams, tasks and a timetable.
3. **Check your university.** Open `Studium/Hochschule.md`. For HSD everything fits; for another university change the
   addresses ([guide](docs/HOCHSCHULE.md), template in [examples/](examples/)).
4. **Connect Moodle and eCampus** (desktop app). _Settings → Studies_. You sign in on your university's own page;
   Notiva never stores a password.
5. **Sync.** Click the sync icon in the tool bar → "Sync everything now". From then on Notiva checks in the background
   and tells you what is new.

In depth – AI, Git, shortcuts, MCP: [docs/GUIDE.en.md](docs/GUIDE.en.md).

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
npm run test:e2e     # Playwright: desktop, tablet, iPhone (WebKit) and Electron
npm run build && node scripts/screenshots.mjs   # images for this README
```

Structure and rules (German): [AGENT.md](AGENT.md) · [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DESIGN.md](docs/DESIGN.md) · [docs/SECURITY.md](docs/SECURITY.md) · progress: [PROGRESS.md](PROGRESS.md)

## License

[MIT](LICENSE) © flexi03 – free to use, change and share.
