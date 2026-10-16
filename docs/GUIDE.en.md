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
  `Studium/Hochschule.md`. Status, attempts, grade and "passed in" are filled by the eCampus sync.
- **Belegung** (what you take) is suggested from Moodle and the term's offer; set it yourself on the module page.
  Modules you take appear in _My semester_.
- **Materials** from Moodle go to `Unterlagen/<module>/Vorlesung`, `Praktikum & Übung` or `Sonstiges`. New
  materials are suggested (hint and notification) and saved once you confirm.
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
- **Moodle courses of a module**: on the module page choose per course "counts now", "another semester" or "not
  counted" – e.g. for courses you only look into.
- **Today** (sidebar) opens the daily note with the day overview: sessions, exams, labs, tasks due and overdue,
  Moodle deadlines – a click opens the entry or the module.
- **Private repositories** (e.g. ProjectBase): the first time Notiva asks for an access token (scope
  `read_repository`) and stores it encrypted per server.
- **Exam schedule**: the faculty's newest PDF is read into _Prüfungen_.
- **Background checks**: every source has its own interval (_Settings → Notifications_).

Another university: [HOCHSCHULE.md](HOCHSCHULE.md) (German) and [examples/Hochschule.md](../examples/Hochschule.md).

## Status bar

At the bottom edge of the window (like VS Code):

- **Left:** the next session and short confirmations ("Saved").
- **Middle:** running tasks with a bar, count and time left. A click opens the list. Errors open it by themselves,
  with a reason and a fix button.
- **Right:**
  - "N suggestions" (opens the notifications)
  - Help
  - Version (about and updates)
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
(`⌘/Ctrl ⇧ G`) with +/− lines, a diff (stacked or side by side), commit of selected files, discard, history and
push/pull. The editor marks changed (blue), new (green) and deleted (red) lines like VS Code.

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
