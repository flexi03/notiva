# Guide

Everything beyond the [README](../README.en.md). Deutsch: [ANLEITUNG.md](ANLEITUNG.md).

## Storage

| Storage     | Where                                                | Platform                                |
| ----------- | ---------------------------------------------------- | --------------------------------------- |
| **Folder**  | a normal folder (syncable with iCloud/Syncthing/Git) | desktop app, Chrome/Edge                |
| **Browser** | the browser's private storage (OPFS)                 | all modern browsers, also Safari on iOS |
| **Demo**    | memory only, with the study dashboard                | everywhere                              |

## Studies

- **Modules** come from the examination regulations (default: BMI, PO 2018 at HSD) or from your own list in
  `Studium/Hochschule.md`. Status, attempts, grade and "passed in" are filled by the eCampus sync.
- **Belegung** (what you take) is suggested from Moodle and the term's offer; set it yourself on the module page.
  Modules you take appear in _My semester_.
- **Materials** from Moodle go to `Unterlagen/<course>/Vorlesung`, `Praktikum & Übung` or `Sonstiges`.
- **Timetable**: sessions are read from the course pages. If they differ from your own entries, Notiva asks.
- **Exam schedule**: the faculty's newest PDF is read into _Prüfungen_.
- **Background checks**: every source has its own interval (_Settings → Notifications_).

Another university: [HOCHSCHULE.md](HOCHSCHULE.md) (German) and [examples/Hochschule.md](../examples/Hochschule.md).

## PDFs and lectures

- `⌘/Ctrl F` searches the PDF, `←/→` turns pages, zoom with pinch or `+`/`−`.
- Highlight, comment, add page notes; select, move and delete with the pointer; `⌘Z` undoes.
- **Lecture mode** (right column): records, transcribes locally with Whisper (the model downloads on first use) and
  follows the slides. Afterwards the AI can summarize.

## Code folders

A page with `code: true` gets a folder next to it: file list, editor, terminal (two side by side if you like), links
and a web page beside it. Git commits with a progress display.

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
