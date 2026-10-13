import { assertSafePath } from '../path'
import type { VaultAdapter } from './types'

/**
 * Wraps an adapter so that every path is validated (no "..", no absolute paths, no control chars).
 * Violations surface as rejected promises, like any other storage error.
 */
export function guardVault(adapter: VaultAdapter): VaultAdapter {
  return {
    kind: adapter.kind,
    name: adapter.name,
    list: () => adapter.list(),
    read: async (path) => adapter.read(assertSafePath(path)),
    readBinary: async (path) => adapter.readBinary(assertSafePath(path)),
    write: async (path, content) => adapter.write(assertSafePath(path), content),
    remove: async (path) => adapter.remove(assertSafePath(path)),
    rename: async (from, to) => adapter.rename(assertSafePath(from), assertSafePath(to)),
  }
}
