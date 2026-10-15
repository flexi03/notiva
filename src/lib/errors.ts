/**
 * Known errors → reason in plain words and, where possible, a fix (ideally one click). Used for
 * every failed action (progress messages, Git panel, toasts). Pure: the fix is only named here and
 * carried out in src/app/fixes.ts.
 */

export type FixKind =
  | 'installGit'
  | 'gitIdentity'
  | 'gitInit'
  | 'gitPull'
  | 'connectStudy'
  | 'aiSettings'
  | 'notificationSettings'
  | 'chooseFolder'
  | 'restart'
  | 'retry'

export interface ExplainedError {
  /** What went wrong, for people. */
  reason: string
  /** How to fix it (one click where possible). */
  fix?: FixKind
}

type Lang = 'de' | 'en'

const RULES: Array<{ test: RegExp; de: string; en: string; fix?: FixKind }> = [
  {
    test: /Git ist nicht installiert|spawn git ENOENT|'git' is not recognized|git: command not found/i,
    de: 'Git ist auf diesem Computer nicht installiert.',
    en: 'Git is not installed on this computer.',
    fix: 'installGit',
  },
  {
    test: /Please tell me who you are|empty ident|user\.email|unable to auto-detect email/i,
    de: 'Git weiß noch nicht, wer du bist (Name und E-Mail für Commits fehlen).',
    en: 'Git does not know who you are yet (name and email for commits are missing).',
    fix: 'gitIdentity',
  },
  {
    test: /not a git repository|No vault repository|Kein Git-Repository/i,
    de: 'Dieser Ordner ist noch kein Git-Repository.',
    en: 'This folder is not a Git repository yet.',
    fix: 'gitInit',
  },
  {
    test: /\[rejected\]|fetch first|non-fast-forward|Updates were rejected/i,
    de: 'Auf dem Server gibt es neuere Änderungen – erst holen (Pull), dann hochladen.',
    en: 'The server has newer changes – pull first, then push.',
    fix: 'gitPull',
  },
  {
    test: /Authentication failed|could not read Username|Permission denied \(publickey\)|terminal prompts disabled/i,
    de: 'Der Git-Server verlangt eine Anmeldung. Einmal im Terminal „git push“ ausführen und anmelden (Git Credential Manager bzw. SSH-Schlüssel) – danach klappt es hier.',
    en: 'The Git server needs you to sign in. Run “git push” once in a terminal and sign in (Git Credential Manager or SSH key) – then it works here.',
  },
  {
    test: /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|Failed to fetch|NetworkError|net::ERR/i,
    de: 'Keine Verbindung zum Server – Internet oder VPN prüfen und noch einmal versuchen.',
    en: 'No connection to the server – check internet or VPN and try again.',
    fix: 'retry',
  },
  {
    test: /Anmeldung abgelaufen|Sitzung abgelaufen|login expired|session expired|invalidtoken|Ungültiges Token|\b401\b/i,
    de: 'Die Anmeldung ist abgelaufen – einmal neu verbinden.',
    en: 'The sign-in has expired – connect again.',
    fix: 'connectStudy',
  },
  {
    test: /EACCES|EPERM|permission denied|operation not permitted|Zugriff verweigert/i,
    de: 'Keine Berechtigung für diesen Ordner oder diese Datei. Ordner neu wählen oder Rechte prüfen (macOS: Systemeinstellungen → Datenschutz → Dateien und Ordner).',
    en: 'No permission for this folder or file. Choose the folder again or check its permissions.',
    fix: 'chooseFolder',
  },
  {
    test: /ENOSPC|no space left/i,
    de: 'Der Speicher ist voll – Platz schaffen und noch einmal versuchen.',
    en: 'The disk is full – free some space and try again.',
  },
  {
    test: /API key|api_key|Unauthorized model|Kein Modell|No model|model not found|ollama/i,
    de: 'Die KI ist noch nicht (richtig) eingerichtet – Anbieter, Modell oder Schlüssel prüfen.',
    en: 'The AI is not set up (correctly) yet – check provider, model or key.',
    fix: 'aiSettings',
  },
  {
    test: /UNErrorDomain|Notifications? (are )?not allowed|Mitteilungen.*(blockiert|abgelehnt)/i,
    de: 'Das System blockiert Mitteilungen von Notiva – in den Mitteilungseinstellungen erlauben.',
    en: 'The system blocks notifications from Notiva – allow them in the notification settings.',
    fix: 'notificationSettings',
  },
  {
    test: /Untrusted sender|Object has been destroyed|Render frame was disposed/i,
    de: 'Ein interner Fehler im Fenster – ein Neustart von Notiva behebt das.',
    en: 'An internal window error – restarting Notiva fixes it.',
    fix: 'restart',
  },
]

/** Strips Electron's "Error invoking remote method …" wrapper. */
export function cleanMessage(message: string): string {
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '').trim()
}

/** The known reason (and fix) for an error, or null if Notiva has no better words for it. */
export function explainError(error: unknown, lang: Lang = 'de'): ExplainedError | null {
  const message = cleanMessage(error instanceof Error ? error.message : String(error ?? ''))
  const rule = RULES.find((r) => r.test.test(message))
  if (!rule) return null
  return { reason: rule[lang], ...(rule.fix ? { fix: rule.fix } : {}) }
}
