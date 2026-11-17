import { ipcMain } from 'electron'
import { SEARCH_CHANNELS } from '@shared/ipc'
import { openSearch } from '../search/engine'
import { getSettings } from '../settings/store'
import { fail, guard, ok } from './result'

/** A query with results on any working backend. */
const TEST_QUERY = 'wikipedia'
const TEST_TIMEOUT_MS = 20_000

/** Runs one query with the saved settings, so the Search pane can show whether search works. */
async function testSearch(): Promise<number> {
  const search = openSearch(getSettings().search)
  try {
    const hits = await search.search(TEST_QUERY, AbortSignal.timeout(TEST_TIMEOUT_MS))
    return hits.length
  } finally {
    search.close()
  }
}

export function registerSearchIpcHandlers(): void {
  ipcMain.handle(
    SEARCH_CHANNELS.test,
    guard('search', async () => {
      try {
        return ok(await testSearch())
      } catch (error) {
        // These messages are written for the user: which setting to fix
        const message = error instanceof Error ? error.message : String(error)
        return fail({ code: 'UNKNOWN', message })
      }
    })
  )
}
