/**
 * Workspace = in-memory index over a vault. All reads are synchronous queries on the index;
 * all writes go through here so the index, links and files never drift apart.
 * Framework-agnostic: React subscribes via {@link Workspace.subscribe}.
 */
import MiniSearch from 'minisearch'
import { parseMarkdown, serializeMarkdown, type FrontmatterData, type FrontmatterValue } from './frontmatter'
import {
  extractTags,
  extractWikiLinks,
  renameWikiLinks,
  rewriteBodyPaths,
  rewritePathReferences,
  type WikiLink,
} from './links'
import { basename, dirname, extname, isInside, joinPath, toFileName, uniquePath } from './path'
import {
  parseDatabaseDef,
  rowValues,
  serializeDatabaseDef,
  type DatabaseDef,
  type ResolvedRow,
  type Row,
} from './database'
import { toPlainText } from './plainText'
import { guardVault, type VaultAdapter, type VaultFile } from './vault'

export const META_DIR = '.notiva'
export const TRASH_DIR = `${META_DIR}/trash`

export interface Page {
  path: string
  title: string
  icon?: string
  data: FrontmatterData
  body: string
  mtime: number
  /** Set if this page is a database. */
  database: DatabaseDef | null
  /** Path of the database page if this page is one of its rows. */
  parentDatabase: string | null
  links: WikiLink[]
  tags: string[]
  /** YAML problem in the file (the page is still shown, frontmatter ignored). */
  error?: string
}

export interface TreeNode {
  /** Folder path or page path. */
  id: string
  title: string
  icon?: string
  page: Page | null
  /** Set for documents (PDF, slides …) shown in the tree; `id` is then the file path. */
  file?: string
  children: TreeNode[]
}

/** Files that appear in the page tree next to the notes (scripts, slides …). */
export const TREE_FILES = /\.(pdf|pptx?|docx?|xlsx?|odt|odp|ods|key|pages|epub)$/i

export interface TrashEntry {
  id: string
  original: string
  deletedAt: string
  files: string[]
}

export interface SearchHit {
  path: string
  title: string
  snippet: string
  score: number
}

const isMarkdown = (path: string) => extname(path).toLowerCase() === '.md'
const stem = (path: string) => basename(path, extname(path))

export class Workspace {
  readonly vault: VaultAdapter
  private pages = new Map<string, Page>()
  /** Autosave off: page texts waiting for "Speichern" (path → file text). */
  private pending = new Map<string, string>()
  private autosaveOn = true
  /** Frontmatter as written in each file – saves only touch the keys that really changed. */
  private yamlSource = new Map<string, string>()
  private files: VaultFile[] = []
  private listeners = new Set<() => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private searchIndex: MiniSearch | null = null
  private derived: { tree?: TreeNode[]; backlinks?: Map<string, string[]>; tags?: Map<string, string[]> } = {}
  version = 0

  private constructor(vault: VaultAdapter) {
    this.vault = guardVault(vault)
  }

  static async open(vault: VaultAdapter): Promise<Workspace> {
    const ws = new Workspace(vault)
    await ws.reload()
    return ws
  }

  /* ---------- lifecycle ---------- */

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private changed(): void {
    this.version += 1
    this.searchIndex = null
    this.derived = {}
    this.assignDatabases()
    for (const listener of this.listeners) listener()
  }

  /** Serializes writes so concurrent edits cannot interleave. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task)
    this.queue = result.catch(() => undefined)
    return result
  }

  /** (Re)reads all files. Unchanged files (same mtime) are reused. */
  async reload(): Promise<void> {
    const files = await this.vault.list()
    const next = new Map<string, Page>()
    await Promise.all(
      files
        .filter((f) => isMarkdown(f.path) && !f.path.startsWith(`${META_DIR}/`))
        .map(async (file) => {
          const existing = this.pages.get(file.path)
          if (existing && existing.mtime === file.mtime && file.mtime !== 0) next.set(file.path, existing)
          else next.set(file.path, this.buildPage(file.path, await this.vault.read(file.path), file.mtime))
        }),
    )
    // Unsaved pages (autosave off) win over what is on disk.
    for (const [path, text] of this.pending) {
      next.set(path, this.buildPage(path, text, Date.now()))
      if (!files.some((f) => f.path === path)) files.push({ path, mtime: Date.now(), size: text.length })
    }
    this.files = files
    this.pages = next
    for (const path of this.yamlSource.keys()) if (!next.has(path)) this.yamlSource.delete(path)
    this.changed()
  }

  private buildPage(path: string, text: string, mtime: number): Page {
    const { data, body, error, yaml } = parseMarkdown(text)
    if (yaml !== undefined && !error) this.yamlSource.set(path, yaml)
    else this.yamlSource.delete(path)
    const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : stem(path)
    return {
      path,
      title,
      ...(typeof data.icon === 'string' && data.icon ? { icon: data.icon } : {}),
      data,
      body,
      mtime,
      database: data.database !== undefined ? parseDatabaseDef(data.database) : null,
      parentDatabase: null,
      links: extractWikiLinks(body),
      tags: [...new Set([...extractTags(body), ...frontmatterTags(data)])],
      ...(error ? { error } : {}),
    }
  }

  private assignDatabases(): void {
    const folders = new Map<string, string>()
    for (const page of this.pages.values()) if (page.database) folders.set(this.rowFolder(page), page.path)
    for (const page of this.pages.values()) page.parentDatabase = folders.get(dirname(page.path)) ?? null
  }

  /* ---------- queries ---------- */

  get(path: string): Page | undefined {
    return this.pages.get(path)
  }

  all(): Page[] {
    return [...this.pages.values()]
  }

  /** Non-Markdown files (images, PDFs, …). */
  assets(): VaultFile[] {
    return this.files.filter((f) => !isMarkdown(f.path) && !f.path.startsWith(`${META_DIR}/`))
  }

  has(path: string): boolean {
    return this.pages.has(path) || this.files.some((f) => f.path === path)
  }

  /**
   * Resolves a wiki link target like Obsidian: exact path, path without ".md", then file name /
   * title / alias (case-insensitive), preferring pages close to `from`.
   */
  resolveLink(target: string, from?: string): string | null {
    const clean = target.trim().replace(/\.md$/i, '')
    if (!clean) return null
    const lower = clean.toLowerCase()
    if (clean.includes('/') && this.pages.has(`${clean}.md`)) return `${clean}.md`
    const candidates = this.all().filter((p) => {
      if (p.path.slice(0, -3).toLowerCase() === lower) return true
      if (clean.includes('/')) return p.path.slice(0, -3).toLowerCase().endsWith(`/${lower}`)
      if (stem(p.path).toLowerCase() === lower || p.title.toLowerCase() === lower) return true
      const aliases = p.data.aliases
      return Array.isArray(aliases) && aliases.some((a) => typeof a === 'string' && a.toLowerCase() === lower)
    })
    if (candidates.length === 0) return null
    if (candidates.length === 1 || !from)
      return candidates.sort((a, b) => a.path.length - b.path.length)[0]!.path
    const fromDir = dirname(from)
    const distance = (p: Page) => {
      const a = fromDir.split('/')
      const b = dirname(p.path).split('/')
      let common = 0
      while (common < a.length && common < b.length && a[common] === b[common]) common++
      return a.length + b.length - 2 * common
    }
    return candidates.sort((a, b) => distance(a) - distance(b) || a.path.length - b.path.length)[0]!.path
  }

  /** Shortest unique link text for a page (file name, or path if ambiguous). */
  linkText(path: string): string {
    const name = stem(path)
    return this.resolveLink(name) === path ? name : path.slice(0, -3)
  }

  backlinks(path: string): Page[] {
    if (!this.derived.backlinks) {
      const map = new Map<string, string[]>()
      for (const page of this.pages.values()) {
        const targets = new Set<string>()
        for (const link of page.links) {
          const resolved = this.resolveLink(link.target, page.path)
          if (resolved && resolved !== page.path) targets.add(resolved)
        }
        // Relation properties count as links, too.
        for (const value of Object.values(page.data)) {
          for (const item of Array.isArray(value) ? value : [value]) {
            const match = typeof item === 'string' ? /^\[\[([^\]|#]+)/.exec(item) : null
            const resolved = match ? this.resolveLink(match[1]!, page.path) : null
            if (resolved && resolved !== page.path) targets.add(resolved)
          }
        }
        for (const target of targets) map.set(target, [...(map.get(target) ?? []), page.path])
      }
      this.derived.backlinks = map
    }
    return (this.derived.backlinks.get(path) ?? []).map((p) => this.pages.get(p)!).filter(Boolean)
  }

  /** tag → page paths, sorted by tag. */
  tags(): Map<string, string[]> {
    if (!this.derived.tags) {
      const map = new Map<string, string[]>()
      for (const page of this.pages.values())
        for (const tag of page.tags) map.set(tag, [...(map.get(tag) ?? []), page.path])
      this.derived.tags = new Map([...map].sort(([a], [b]) => a.localeCompare(b, 'de')))
    }
    return this.derived.tags
  }

  /** Sidebar tree. A folder "A/" and page "A.md" merge into one node. Database rows are hidden. */
  tree(): TreeNode[] {
    if (this.derived.tree) return this.derived.tree
    const root: TreeNode = { id: '', title: '', page: null, children: [] }
    const nodes = new Map<string, TreeNode>([['', root]])
    const ensureFolder = (folder: string): TreeNode => {
      const existing = nodes.get(folder)
      if (existing) return existing
      const node: TreeNode = { id: folder, title: basename(folder), page: null, children: [] }
      nodes.set(folder, node)
      ensureFolder(dirname(folder)).children.push(node)
      return node
    }
    const visible = this.all().filter((p) => !p.parentDatabase)
    for (const page of visible) {
      const folderKey = page.path.slice(0, -3)
      const node = nodes.get(folderKey)
      if (node) {
        node.page = page
        node.id = page.path
        node.title = page.title
        if (page.icon) node.icon = page.icon
      } else {
        const created: TreeNode = {
          id: page.path,
          title: page.title,
          ...(page.icon ? { icon: page.icon } : {}),
          page,
          children: [],
        }
        nodes.set(folderKey, created)
        ensureFolder(dirname(page.path)).children.push(created)
      }
    }
    for (const file of this.assets()) {
      if (!TREE_FILES.test(file.path)) continue
      ensureFolder(dirname(file.path)).children.push({
        id: file.path,
        title: basename(file.path),
        file: file.path,
        page: null,
        children: [],
      })
    }
    // Folders that only contain database rows must still appear (they are the database itself).
    const prune = (node: TreeNode): boolean => {
      node.children = node.children.filter(prune)
      if (node.page?.database) node.children = []
      return node.page !== null || node.file !== undefined || node.children.length > 0
    }
    root.children = root.children.filter(prune)
    const sortNodes = (list: TreeNode[]) => {
      list.sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title, 'de', { numeric: true }))
      for (const n of list) sortNodes(n.children)
    }
    sortNodes(root.children)
    this.derived.tree = root.children
    return root.children
  }

  /** Direct sub-pages of a page (pages in the folder with the page's name). */
  children(path: string): Page[] {
    const folder = path.slice(0, -3)
    return this.all()
      .filter((p) => dirname(p.path) === folder)
      .sort((a, b) => a.title.localeCompare(b.title, 'de', { numeric: true }))
  }

  /** Breadcrumb from the root to `path`. */
  breadcrumbs(path: string): Array<{ path: string | null; title: string }> {
    const parts = dirname(path).split('/').filter(Boolean)
    const crumbs: Array<{ path: string | null; title: string }> = []
    for (let i = 0; i < parts.length; i++) {
      const folder = parts.slice(0, i + 1).join('/')
      const page = this.pages.get(`${folder}.md`)
      crumbs.push({ path: page?.path ?? null, title: page?.title ?? parts[i]! })
    }
    return crumbs
  }

  databases(): Page[] {
    return this.all()
      .filter((p) => p.database)
      .sort((a, b) => a.title.localeCompare(b.title, 'de'))
  }

  rowFolder(dbPage: Page): string {
    const base = dirname(dbPage.path)
    return dbPage.database?.folder ? joinPath(base, dbPage.database.folder) : dbPage.path.slice(0, -3)
  }

  /** Finds a database by path, path without extension, or title (used by embeds and tiles). */
  findDatabase(ref: string, from?: string): Page | null {
    const resolved = this.resolveLink(ref.replace(/^\[\[|\]\]$/g, ''), from)
    const page = resolved ? this.pages.get(resolved) : undefined
    return page?.database ? page : null
  }

  rows(dbPath: string): Row[] {
    const db = this.pages.get(dbPath)
    if (!db?.database) return []
    return this.all()
      .filter((p) => p.parentDatabase === dbPath)
      .map((p) => ({ path: p.path, title: p.title, data: p.data, body: p.body, mtime: p.mtime }))
  }

  /** Rows with computed values (formulas, relations, rollups). */
  resolvedRows(dbPath: string, now = new Date()): ResolvedRow[] {
    const db = this.pages.get(dbPath)
    if (!db?.database) return []
    const def = db.database
    const resolveRow = (link: string) => {
      const path = this.resolveLink(link, dbPath)
      const page = path ? this.pages.get(path) : undefined
      const parent = page?.parentDatabase ? this.pages.get(page.parentDatabase) : undefined
      if (!page || !parent?.database) return null
      return {
        row: { path: page.path, title: page.title, data: page.data, body: page.body, mtime: page.mtime },
        def: parent.database,
      }
    }
    return this.rows(dbPath).map((row) => ({ row, values: rowValues(row, def, { now, resolveRow }) }))
  }

  search(query: string, limit = 30): SearchHit[] {
    const q = query.trim()
    if (!q) return []
    if (!this.searchIndex) {
      this.searchIndex = new MiniSearch({
        fields: ['title', 'tags', 'text'],
        storeFields: ['title'],
        searchOptions: { boost: { title: 3, tags: 2 }, prefix: true, fuzzy: 0.2 },
      })
      this.searchIndex.addAll(
        this.all().map((p) => ({
          id: p.path,
          title: p.title,
          tags: p.tags.join(' '),
          text: toPlainText(p.body),
        })),
      )
    }
    return this.searchIndex
      .search(q)
      .slice(0, limit)
      .map((hit) => ({
        path: String(hit.id),
        title: String(hit.title),
        score: hit.score,
        snippet: snippet(toPlainText(this.pages.get(String(hit.id))?.body ?? ''), hit.terms),
      }))
  }

  /* ---------- writes ---------- */

  private async writePage(path: string, data: FrontmatterData, body: string): Promise<void> {
    const text = serializeMarkdown({ data, body }, this.yamlSource.get(path))
    if (this.autosaveOn) await this.vault.write(path, text)
    else this.pending.set(path, text)
    this.pages.set(path, this.buildPage(path, text, Date.now()))
    if (!this.files.some((f) => f.path === path))
      this.files.push({ path, mtime: Date.now(), size: text.length })
  }

  /** Creates a page "<folder>/<title>.md" (unique name) and returns its path. */
  createPage(options: {
    folder?: string
    title: string
    data?: FrontmatterData
    body?: string
  }): Promise<string> {
    return this.run(async () => {
      const name = toFileName(options.title)
      const path = uniquePath(joinPath(options.folder ?? '', `${name}.md`), (p) => this.has(p))
      const data = { ...(options.data ?? {}) }
      if (name !== options.title.trim() && options.title.trim()) data.title = options.title.trim()
      await this.writePage(path, data, options.body ?? '')
      this.changed()
      return path
    })
  }

  /** Creates a sub-page inside the folder belonging to `parentPath`. */
  createChild(parentPath: string, title: string, data?: FrontmatterData, body?: string): Promise<string> {
    return this.createPage({
      folder: parentPath.slice(0, -3),
      title,
      ...(data ? { data } : {}),
      ...(body !== undefined ? { body } : {}),
    })
  }

  createDatabase(options: {
    folder?: string
    title: string
    def: DatabaseDef
    data?: FrontmatterData
    body?: string
  }): Promise<string> {
    return this.createPage({
      ...options,
      data: { ...(options.data ?? {}), database: serializeDatabaseDef(options.def) },
    })
  }

  createRow(dbPath: string, title: string, values: FrontmatterData = {}): Promise<string> {
    const db = this.pages.get(dbPath)
    if (!db?.database) return Promise.reject(new Error(`Not a database: ${dbPath}`))
    return this.createPage({
      folder: this.rowFolder(db),
      title,
      data: values,
      body: db.database.rowTemplate ?? '',
    })
  }

  /** Saves body and/or frontmatter of an existing page. */
  save(path: string, changes: { data?: FrontmatterData; body?: string }): Promise<void> {
    return this.run(async () => {
      const page = this.pages.get(path)
      if (!page) throw new Error(`Not found: ${path}`)
      const data = changes.data ?? page.data
      const body = changes.body ?? page.body
      if (data === page.data && body === page.body) return
      await this.writePage(path, data, body)
      this.changed()
    })
  }

  /* ---------- autosave ---------- */

  get autosave(): boolean {
    return this.autosaveOn
  }

  /** Turning autosave on writes everything that is still pending. */
  async setAutosave(on: boolean): Promise<void> {
    this.autosaveOn = on
    if (on) await this.saveAll()
  }

  /** Pages with changes that are not on disk yet. */
  unsaved(): string[] {
    return [...this.pending.keys()]
  }

  /** Writes all pending changes ("Speichern" / ⌘S). */
  saveAll(): Promise<number> {
    return this.run(() => this.flushPending())
  }

  private async flushPending(): Promise<number> {
    const entries = [...this.pending]
    for (const [path, text] of entries) {
      await this.vault.write(path, text)
      this.pending.delete(path)
    }
    if (entries.length) this.changed()
    return entries.length
  }

  /** Drops pending changes and reloads from disk. */
  async discardUnsaved(): Promise<void> {
    // Read these pages fresh from disk – never reuse the in-memory (discarded) version.
    for (const path of this.pending.keys()) this.pages.delete(path)
    this.pending.clear()
    await this.reload()
  }

  /** The page as Markdown text, frontmatter formatted like in the file. */
  source(path: string): string {
    const page = this.pages.get(path)
    if (!page) throw new Error(`Not found: ${path}`)
    return serializeMarkdown({ data: page.data, body: page.body }, this.yamlSource.get(path))
  }

  /** Saves a page from Markdown text exactly as given (source mode). Throws on invalid YAML. */
  saveSource(path: string, text: string): Promise<void> {
    return this.run(async () => {
      if (!this.pages.has(path)) throw new Error(`Not found: ${path}`)
      const parsed = parseMarkdown(text)
      if (parsed.error) throw new Error(parsed.error)
      if (text === this.source(path)) return
      if (this.autosaveOn) await this.vault.write(path, text)
      else this.pending.set(path, text)
      this.pages.set(path, this.buildPage(path, text, Date.now()))
      this.changed()
    })
  }

  /** Sets (or removes with `undefined`) one frontmatter key. */
  setProperty(path: string, key: string, value: FrontmatterValue | undefined): Promise<void> {
    const page = this.pages.get(path)
    if (!page) return Promise.reject(new Error(`Not found: ${path}`))
    const data = { ...page.data }
    if (value === undefined) delete data[key]
    else data[key] = value
    return this.save(path, { data })
  }

  updateDatabase(path: string, update: (def: DatabaseDef) => DatabaseDef): Promise<void> {
    const page = this.pages.get(path)
    if (!page?.database) return Promise.reject(new Error(`Not a database: ${path}`))
    return this.setProperty(path, 'database', serializeDatabaseDef(update(structuredClone(page.database))))
  }

  /** Renames a database property and migrates the stored values in all rows. */
  renameDatabaseProperty(dbPath: string, from: string, to: string): Promise<void> {
    return this.updateDatabase(dbPath, (def) => {
      for (const p of def.properties) {
        if (p.name === from) p.name = to
        if (p.relation === from) p.relation = to
      }
      for (const v of def.views) {
        if (v.groupBy === from) v.groupBy = to
        if (v.dateProperty === from) v.dateProperty = to
        v.filter?.forEach((f) => f.property === from && (f.property = to))
        v.sort?.forEach((s) => s.property === from && (s.property = to))
        if (v.properties) v.properties = v.properties.map((p) => (p === from ? to : p))
      }
      return def
    }).then(async () => {
      for (const row of this.rows(dbPath)) {
        if (!(from in row.data)) continue
        const data: FrontmatterData = {}
        for (const [k, v] of Object.entries(row.data)) data[k === from ? to : k] = v
        await this.save(row.path, { data })
      }
    })
  }

  /**
   * Renames a page: moves the file and its sub-page folder, and rewrites [[links]] in every
   * other page. Returns the new path.
   */
  rename(path: string, newTitle: string): Promise<string> {
    const page = this.pages.get(path)
    if (!page) return Promise.reject(new Error(`Not found: ${path}`))
    const name = toFileName(newTitle)
    const target = uniquePath(joinPath(dirname(path), `${name}.md`), (p) => p !== path && this.has(p))
    return this.move(path, target, newTitle.trim())
  }

  /** Moves a page into another folder (keeping its name). */
  moveTo(path: string, folder: string): Promise<string> {
    if (isInside(folder, path.slice(0, -3)))
      return Promise.reject(new Error('Cannot move a page into itself'))
    const target = uniquePath(joinPath(folder, basename(path)), (p) => p !== path && this.has(p))
    return this.move(path, target)
  }

  /** All link targets (per page) that currently resolve to `path`. */
  private incomingTargets(path: string): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>()
    const add = (from: string, target: string) => {
      if (this.resolveLink(target, from) !== path) return
      result.set(from, (result.get(from) ?? new Set()).add(target))
    }
    for (const page of this.all()) {
      for (const link of page.links) add(page.path, link.target)
      for (const value of Object.values(page.data)) {
        for (const item of Array.isArray(value) ? value : [value]) {
          if (typeof item === 'string') for (const link of extractWikiLinks(item)) add(page.path, link.target)
        }
      }
    }
    return result
  }

  private move(path: string, target: string, newTitle?: string): Promise<string> {
    return this.run(async () => {
      // Moving works on the files: unsaved changes go to disk first.
      await this.flushPending()
      const page = this.pages.get(path)!
      const incoming = this.incomingTargets(path)
      const oldFolder = path.slice(0, -3)
      const newFolder = target.slice(0, -3)
      const movedPath = (p: string) =>
        p === path ? target : p.startsWith(`${oldFolder}/`) ? newFolder + p.slice(oldFolder.length) : p
      const data = { ...page.data }
      if (newTitle !== undefined) {
        if (toFileName(newTitle) !== newTitle) data.title = newTitle
        else delete data.title
      }
      if (target !== path) {
        const moves = this.files.filter((f) => f.path.startsWith(`${oldFolder}/`))
        await this.vault.rename(path, target)
        for (const f of moves) await this.vault.rename(f.path, movedPath(f.path))
      }
      await this.vault.write(target, serializeMarkdown({ data, body: page.body }, this.yamlSource.get(path)))
      await this.reload()
      const newLink = this.linkText(target)
      const incomingAfterMove = new Map([...incoming].map(([from, targets]) => [movedPath(from), targets]))
      for (const other of this.all()) {
        const targets = incomingAfterMove.get(other.path)
        const rename = (t: string) => !!targets?.has(t) && t !== newLink
        let body = renameWikiLinks(other.body, rename, newLink)
        let otherData = renameInData(other.data, rename, newLink)
        // Path references (widgets "source: Folder/Db", relation schemas, [[Folder/Page]]) follow the move.
        if (target !== path) {
          body = rewriteBodyPaths(body, oldFolder, newFolder)
          otherData = mapStrings(otherData, (value) => rewritePathReferences(value, oldFolder, newFolder))
        }
        if (body !== other.body || otherData !== other.data) await this.writePage(other.path, otherData, body)
      }
      this.changed()
      return target
    })
  }

  /** Moves a page (and its sub-pages) to the trash. */
  trash(path: string): Promise<TrashEntry> {
    return this.run(async () => {
      if (!this.pages.has(path)) throw new Error(`Not found: ${path}`)
      await this.flushPending()
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const folder = path.slice(0, -3)
      const files = this.files
        .filter((f) => f.path === path || f.path.startsWith(`${folder}/`))
        .map((f) => f.path)
      for (const file of files) await this.vault.rename(file, `${TRASH_DIR}/${id}/${file}`)
      const entry: TrashEntry = { id, original: path, deletedAt: new Date().toISOString(), files }
      await this.vault.write(`${TRASH_DIR}/${id}.json`, JSON.stringify(entry))
      await this.reload()
      return entry
    })
  }

  async listTrash(): Promise<TrashEntry[]> {
    const files = await this.vault.list()
    const entries = await Promise.all(
      files
        .filter((f) => dirname(f.path) === TRASH_DIR && f.path.endsWith('.json'))
        .map(async (f) => {
          try {
            return JSON.parse(await this.vault.read(f.path)) as TrashEntry
          } catch {
            return null
          }
        }),
    )
    return entries
      .filter((e): e is TrashEntry => e !== null && typeof e.id === 'string')
      .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
  }

  restore(id: string): Promise<string> {
    return this.run(async () => {
      const entry = (await this.listTrash()).find((e) => e.id === id)
      if (!entry) throw new Error(`Not in trash: ${id}`)
      let original = entry.original
      for (const file of entry.files) {
        let target = file
        if (this.has(target)) target = uniquePath(target, (p) => this.has(p))
        if (file === entry.original) original = target
        await this.vault.rename(`${TRASH_DIR}/${id}/${file}`, target)
      }
      await this.vault.remove(`${TRASH_DIR}/${id}.json`)
      await this.reload()
      return original
    })
  }

  deleteFromTrash(id: string): Promise<void> {
    return this.run(async () => {
      const entry = (await this.listTrash()).find((e) => e.id === id)
      if (!entry) return
      for (const file of entry.files)
        await this.vault.remove(`${TRASH_DIR}/${id}/${file}`).catch(() => undefined)
      await this.vault.remove(`${TRASH_DIR}/${id}.json`)
    })
  }

  /** Duplicates a page (without sub-pages). */
  async duplicate(path: string): Promise<string> {
    const page = this.pages.get(path)
    if (!page) throw new Error(`Not found: ${path}`)
    const data = { ...page.data }
    delete data.title
    return this.createPage({ folder: dirname(path), title: `${page.title} Kopie`, data, body: page.body })
  }

  /** Reads a JSON file in .notiva/ (settings etc.). Returns null if missing or invalid. */
  async readMeta<T>(name: string): Promise<T | null> {
    try {
      return JSON.parse(await this.vault.read(`${META_DIR}/${name}`)) as T
    } catch {
      return null
    }
  }

  writeMeta(name: string, value: unknown): Promise<void> {
    return this.run(() => this.vault.write(`${META_DIR}/${name}`, `${JSON.stringify(value, null, 2)}\n`))
  }

  /** Writes several new files at once (one reload). Fails without writing if any path exists. */
  createFiles(files: Array<{ path: string; content: string }>): Promise<void> {
    return this.run(async () => {
      const taken = files.filter((f) => this.has(f.path)).map((f) => f.path)
      if (taken.length) throw new Error(`Exists: ${taken.join(', ')}`)
      for (const file of files) await this.vault.write(file.path, file.content)
      await this.reload()
    })
  }

  /** Moves files (pages or not) – one reload at the end. Existing targets are never overwritten. */
  moveFiles(moves: Array<{ from: string; to: string }>): Promise<Array<{ from: string; to: string }>> {
    return this.run(async () => {
      await this.flushPending()
      const done: Array<{ from: string; to: string }> = []
      const taken = new Set(this.files.map((f) => f.path))
      for (const { from, to } of moves) {
        if (!taken.has(from) || from === to) continue
        let target = to
        for (let i = 2; taken.has(target); i++) target = to.replace(/(\.[^./]+)?$/, ` ${i}$1`)
        await this.vault.rename(from, target)
        taken.delete(from)
        taken.add(target)
        done.push({ from, to: target })
      }
      await this.reload()
      return done
    })
  }

  /** Deletes a non-Markdown file (pages go to the trash instead). */
  removeFile(path: string): Promise<void> {
    return this.run(async () => {
      if (isMarkdown(path)) throw new Error(`Use trash() for pages: ${path}`)
      await this.vault.remove(path)
      await this.reload()
    })
  }

  writeFile(path: string, content: string | Uint8Array): Promise<void> {
    return this.run(async () => {
      await this.vault.write(path, content)
      await this.reload()
    })
  }
}

function order(node: TreeNode): number {
  const value = node.page?.data.order
  return typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER
}

function frontmatterTags(data: FrontmatterData): string[] {
  const raw = data.tags
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  return list
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean)
}

/** Rewrites "[[Old]]" values in frontmatter (relations). Returns the same object if unchanged. */
function renameInData(
  data: FrontmatterData,
  shouldRename: (target: string) => boolean,
  newLink: string,
): FrontmatterData {
  let changed = false
  const fix = (value: FrontmatterValue): FrontmatterValue => {
    if (typeof value === 'string' && value.includes('[[')) {
      const next = renameWikiLinks(value, shouldRename, newLink)
      if (next !== value) changed = true
      return next
    }
    return Array.isArray(value) ? value.map(fix) : value
  }
  const out: FrontmatterData = {}
  for (const [k, v] of Object.entries(data)) out[k] = fix(v)
  return changed ? out : data
}

/** Applies `fn` to every string in frontmatter. Returns the same object if nothing changed. */
function mapStrings(data: FrontmatterData, fn: (value: string) => string): FrontmatterData {
  let changed = false
  const visit = (value: FrontmatterValue): FrontmatterValue => {
    if (typeof value === 'string') {
      const next = fn(value)
      if (next !== value) changed = true
      return next
    }
    if (Array.isArray(value)) return value.map(visit)
    if (value && typeof value === 'object') {
      const out: FrontmatterData = {}
      for (const [k, v] of Object.entries(value)) out[k] = visit(v)
      return out
    }
    return value
  }
  const out: FrontmatterData = {}
  for (const [k, v] of Object.entries(data)) out[k] = visit(v)
  return changed ? out : data
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  const index =
    terms
      .map((t) => lower.indexOf(t.toLowerCase()))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, index - 40)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 140)}${start + 140 < text.length ? '…' : ''}`
}
