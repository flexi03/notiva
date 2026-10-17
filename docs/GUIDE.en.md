# Guide

Everything beyond the [README](../README.en.md). Deutsch: [ANLEITUNG.md](ANLEITUNG.md).

## Storage

| Storage     | Where                                                | Platform                 |
| ----------- | ---------------------------------------------------- | ------------------------ |
| **Folder**  | a normal folder (syncable with iCloud/Syncthing/Git) | desktop app, Chrome/Edge |
| **Browser** | the browser's private storage (OPFS)                 | all modern browsers      |
| **Demo**    | memory only, with the study dashboard                | everywhere               |

## Studies

- **Modules** come from the examination regulations (default: BMI, PO 2018 at HSD) or from your own list in
  `Studium/Hochschule.md`. Status, attempts, grade and "passed in" are filled by the eCampus sync. When an exam of
  the module (_Prüfungen_) lies in the past and the grade is still missing, it suggests **Note ausstehend**
  (waiting for the grade).
- **Belegung** (what you take) is suggested from Moodle and the term's offer; set it yourself on the module page.
  Modules you take appear in _My semester_.
- **Materials** from Moodle go to `Unterlagen/<module>/Vorlesung`, `Praktikum & Übung` or `Sonstiges`. New
  materials are suggested (hint and notification) and saved once you confirm. A file with the same name and size
  already in your folder is listed as **Assign**: Notiva only remembers where it is. Moodle files you move or delete
  in Notiva are not suggested again as new.
- **Re-read materials** (_Moodle_): fetches Moodle again and lists what differs for you to tick: misplaced files
  (their notes page moves along), missing files and newer versions.
- **New versions** never overwrite your file. They go next to it as `<name> (neu <date>).pdf`. Under
  _Moodle → N new version(s)_, Notiva compares both page by page: changed pages yellow, new ones green, removed
  ones listed. Then you choose **Replace old** (name and notes stay) or **Keep both**.
- **Links** in Moodle (e.g. ProjectBase) open in the browser, where sign-in with 2FA works. Alternatively they open
  in an app window with the university sign-in. For Git projects, **Get repository into the lab** clones the code
  into the lab folder with progress. If the server needs a login, use **Get it in the Terminal**.
- **Everything hangs on the module**: its page shows materials, Moodle info, exams, tasks and notes. There are no
  separate course pages. Overview in the app: _Help → How Notiva works_.
- **My semester**: one coloured card per module you take – next session, exam, open tasks, newest script, new
  materials, "Work on the lab".
- **Timetable** (sidebar): week view in module colours. "Suggest times" reads the Moodle course texts and the first
  pages of intro PDFs. For each session it asks whether to add it and names the source (course or slide and page,
  with the matching sentence). The source stays in the "Quelle" column and shows on hover. If something differs
  from your own entries, Notiva asks. The module page lists its sessions with "Add session" and "Find times".
- **Module page**: at the top the module's sessions from the timetable, for labs the preparations and lab dates.
  - For labs, _Plan dates_ suggests a series: first date from the timetable, rhythm, count from the sheets
    found (P01, Praktikum_02 …), preparation a few days before and reminders.
  - It is added to _Aufgaben_ after a preview (with date, time and `Erinnerung`).
  - _Links from Moodle_ lists Git projects with "Get repository into the lab".
- **Next** in the status bar opens the module. "For this session" there shows the most likely files.
- **Labs**: in the lab folder every session has its own page (P01, P02 …) with date, preparation, sheets,
  repositories and links. "Organise by session" brings an existing folder into this shape (with a preview). Got
  repositories have their own page: the server's description (read only), files, "My notes"; their Git is under
  _Changes → Lab repositories_.
- **Exam preparation** (module page): old, practice and sample exams and exercise sheets from the materials, each
  with its solution (recognised by the file name, e.g. `_Loesung`, `Musterlösung`), exam hints and the days until
  the exam. Ticks are kept in the module page (`vorbereitet:`).
- **Study plan** (module page): spreads the lecture slides (`Unterlagen/<module>/Vorlesung`) over your study days
  until the exam, the last days for old exams. Study days: Mon–Fri, every day or single weekdays, plus days off.
  Recalculated every day – what you missed moves to the other days. The portion is in **Today** too. From 5 weeks
  before an exam Notiva suggests the plan (start, remind later, not for this module).
- **Grade calculator** (_Grades_): your average now, with expected grades and the grade needed for a target – from
  the module database, guesses stay on the device.
- **Moodle courses of a module**: on the module page choose per course "counts now", "another semester" or "not
  counted" – e.g. for courses you only look into. Nothing comes from "not counted" any more (no files, deadlines,
  announcements); "another semester" reports new files only as a grey note.
- **Assignments** from Moodle show their state in _Today_ ("not submitted", "submitted", "graded 1.7"); a new grade
  arrives as a notification with feedback.
- **Today** (sidebar) opens the daily note with the day overview: sessions, exams, labs, tasks due and overdue,
  Moodle deadlines – a click opens the entry or the module.
- **Private repositories** (e.g. ProjectBase): the first time Notiva asks for an access token (scope
  `read_repository`) and stores it encrypted per server.
- **Exam schedule**: the faculty's newest PDF is read into _Prüfungen_.
- **Background checks**: every source has its own interval (_Settings → Notifications_).

Another university: [HOCHSCHULE.md](HOCHSCHULE.md) (German) and [examples/Hochschule.md](../examples/Hochschule.md).

## Calendar on the phone

Switch on _Settings → Studies → Calendar on the phone_ and scan the QR code with the phone camera ("Subscribe") – or
in Apple Calendar _Add subscription calendar_ with the copied address. It holds the timetable (weekly until the end
of the semester, from the _Semester_ database), exams, deadlines, labs, preparations and the study plan. The
desktop app offers the address with a secret key on your Wi-Fi (with Tailscale also on the go); the phone updates
while the Mac is on. **New address** makes old subscriptions invalid. On first use macOS asks whether Notiva may
accept incoming connections – please allow it.

## Search

**⌘K** searches titles and text of your pages and – in the desktop app – the text of all PDFs ("In scripts", with
the page). Notiva reads the PDFs once in the background and keeps the text in `.notiva/cache/` (not in Git).

## Backup

_Settings → Storage & data → Backup_: once a day a complete copy of your folder in a backup folder of its own
(default `~/Documents/Notiva-Backups/<folder name>/<date time>`). Every backup is a normal folder; unchanged files are
hard links to the previous one and take no space. The last 14 days and one per month are kept. **Restore** puts the
state as a new folder next to yours – nothing is overwritten. Include the Git history (`.git`) if you like.

## Side bar and path

- **Several entries**: ⌘/Ctrl-click chooses one by one, Shift-click a range. Drag them onto a page or folder (notes
  and Moodle bookkeeping move along), or move them to the trash together with Delete or right click – with undo.
- **Path at the top**: the whole path, PDFs included. A click on a folder shows what it holds, its folder page,
  "Show in Finder" and "Copy folder path". A click on the name at the end makes the path editable.
- **Shelf**: at the bottom of the left activity bar; drag its icon to the bottom right if you like.

## Status bar

At the bottom edge of the window (like VS Code):

- **Left:** the next session and short confirmations ("Saved").
- **Middle:** running tasks with a bar, count and time left. A click opens the list. Errors open it by themselves,
  with a reason and a fix button.
- **Right:**
  - "N suggestions" (opens the notifications)
  - Help
  - Version (about and updates – _Settings → About_ also lists every version to install)
  - "Report a problem"

Background checks report in the notifications what they found and what of it is new.

## PDFs and lectures

- `⌘/Ctrl F` searches the PDF, `←/→` turns pages, zoom with pinch or `+`/`−`.
- Highlight, comment, add page notes; select, move and delete with the pointer; `⌘Z` undoes.
- **Lecture mode** (right column): records, transcribes locally with Whisper (the model downloads on first use) and
  follows the slides. Afterwards the AI can summarize.

## Code folders

A page with `code: true` gets a folder next to it: file list, editor, terminal (two side by side if you like), links
and a web page beside it. Git commits with a progress display. Links to Git projects offer "Get repository into the
lab" (`git clone` into the folder).

## AI

Open the assistant with ✨ in the tool bar or `⌘/Ctrl J`.

- **Installed AI tool (desktop app, recommended):** if **Claude Code** is installed, one click on _Use Claude Code_.
  Notiva starts it with your login and gives it **only Notiva's tools** – no shell, no files outside the folder,
  deleting is not allowed. Codex CLI and Google Antigravity (`agy`) are detected too (experimental, without Notiva's
  tools).
- **Directly via an API:** Ollama/LM Studio (free, local), OpenRouter, Anthropic, OpenAI-compatible –
  _Settings → AI_. In the browser Ollama must allow the page: `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`.
- **Context:** the bar above the input shows what is sent – the open page, the current PDF page or the whole PDF,
  highlights. Every reply shows _Sent_ with system prompt and model.
- **Chats** are kept in the history and can be resumed.
- **MCP (Claude Desktop, Claude Code, …):** _Settings → MCP server_ shows the config to copy. The desktop app runs
  the server itself. Without it:

```bash
npm run mcp:build
claude mcp add notiva -- node /path/to/notiva/dist-mcp/notiva-mcp.mjs /path/to/your/folder
# read only: … notiva-mcp.mjs /path/to/your/folder --read-only
```

## Local mini model

For quick summaries without internet or account: _Settings → AI → Local mini model_. Notiva uses
[llama.cpp](https://github.com/ggml-org/llama.cpp) (button "Install llama.cpp": Homebrew or winget) and a small
Qwen 2.5 model (recommended 1.5 B, ~1.1 GB; small 0.5 B, ~0.5 GB), downloaded once with a progress bar and checked
by checksum. In the Git panel it then summarises every changed file and suggests the commit message (automatically;
you can edit it, ✨ asks again). The model only listens on `127.0.0.1` and stops
after 5 idle minutes.

## Sign-in (Microsoft)

eCampus and Moodle sign in through your university. Choose **Yes** at "Stay signed in?" – then Notiva renews the
sign-in in the background and one sign-in serves both eCampus and Moodle. If it still expires, a notification with
**"Sign in again"** opens the sign-in window directly.

## Error messages

When something fails, Notiva names the reason in plain words and offers a button to fix it ("Install Git", "Sign in
again", "Try again"). The technical message stays visible below – helpful for an issue on GitHub.

## Git

If your folder is a Git repository (or after _Set up Git_), the desktop app shows new, changed and deleted pages
(`⌘/Ctrl ⇧ G`) with +/− lines, a diff (stacked or side by side), commit of selected files, discard (one by one or
**Discard all** for the chosen ones; new files go to the trash), history and push/pull. The editor marks changed (blue), new (green) and deleted (red) lines like VS Code.

### Connect with GitHub or GitLab

1. Create a new, **empty** repository there (no README), preferably private.
2. In Notiva under _Changes_ click **Add remote**, paste the HTTPS address, **Connect and upload**.
3. If the server asks for a login: **Enter access token** (GitHub: scope "repo", GitLab: "read_repository" and
   "write_repository"). Notiva stores it encrypted in the keychain.

Notiva explains the usual errors right away: wrong address, repository not empty, missing login.

## Shortcuts

|                        |                                       |
| ---------------------- | ------------------------------------- |
| `⌘/Ctrl K`             | search, open or create a page         |
| `⌘/Ctrl N`             | new page                              |
| `⌘/Ctrl ⇧ D`           | daily note                            |
| `⌘/Ctrl \`             | sidebar                               |
| `⌘/Ctrl J`             | AI assistant                          |
| `⌘/Ctrl ,`             | settings                              |
| `⌘/Ctrl [` / `]`       | back / forward                        |
| `⌘/Ctrl`-click         | open an entry fully instead of a peek |
| `/`                    | commands in the editor                |
| `[[`                   | link a page                           |
| `⌘/Ctrl B · I · E · K` | bold · italic · code · link           |
| `⌘/Ctrl ⇧ H`           | ==highlight==                         |
| `Esc` / `⌘↵`           | finish block                          |
