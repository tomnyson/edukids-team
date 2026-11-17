import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { SEARCH_BACKENDS, normaliseInstanceUrl, type SearchBackendId } from '@shared/search'
import { useSettings } from '@renderer/hooks/settingsContext'
import { Picker, Row, type Choice } from './controls'

const BACKEND_CHOICES: readonly Choice<SearchBackendId>[] = SEARCH_BACKENDS.map((backend) => ({
  id: backend.id,
  label: backend.label
}))

type TestState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly ok: boolean; readonly note: string }

const BUTTON =
  'rounded-[var(--radius-md)] border border-line bg-canvas px-3 py-1.5 text-[length:var(--text-ui)] text-muted transition-colors duration-[var(--duration-fast)] hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:text-faint'

/** Where web search results come from for direct chats. Neither source needs a key. */
export function SearchPane(): React.JSX.Element {
  const { settings, update } = useSettings()
  const [draft, setDraft] = useState(settings.search.searxngUrl)
  const [urlNote, setUrlNote] = useState<string | null>(null)
  const [test, setTest] = useState<TestState>({ status: 'idle' })

  const usesBrowser = settings.search.backend === 'browser'

  const saveUrl = async (): Promise<void> => {
    const trimmed = draft.trim()
    if (trimmed && !normaliseInstanceUrl(trimmed)) {
      setUrlNote('That is not a web address. It must start with http:// or https://.')
      return
    }
    const result = await update({ search: { searxngUrl: trimmed } })
    setUrlNote(result.ok ? (trimmed ? 'Saved.' : 'Removed.') : result.error.message)
    setTest({ status: 'idle' })
  }

  const runTest = async (): Promise<void> => {
    setTest({ status: 'running' })
    const result = await window.api.search.test()
    setTest(
      result.ok
        ? {
            status: 'done',
            ok: result.data > 0,
            note:
              result.data > 0
                ? `Working: ${result.data} results came back.`
                : 'It answered, but with no results.'
          }
        : { status: 'done', ok: false, note: result.error.message }
    )
  }

  return (
    <section aria-label="Search">
      <Row
        label="Search with"
        hint={SEARCH_BACKENDS.find((backend) => backend.id === settings.search.backend)?.hint}
      >
        <Picker<SearchBackendId>
          label="Search with"
          value={settings.search.backend}
          options={BACKEND_CHOICES}
          onChange={(value) => {
            setTest({ status: 'idle' })
            void update({ search: { backend: value } })
          }}
        />
      </Row>

      {usesBrowser ? (
        <p className="flex gap-2 border-b border-line py-3 text-[length:var(--text-micro)] leading-snug text-muted">
          <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
          <span>
            This reads a search engine’s results page like a browser would. It is not an API: it can
            stop working when the page changes, the engine may limit or challenge automated use, and
            its terms may not allow it. When a human check appears the search stops.
          </span>
        </p>
      ) : (
        <Row
          label="SearXNG instance"
          hint={
            urlNote ??
            'The address of an instance you run. `json` must be listed under `search.formats` in its settings.yml.'
          }
        >
          <div className="flex items-center gap-2">
            <input
              type="url"
              aria-label="SearXNG instance URL"
              value={draft}
              placeholder="http://localhost:8888"
              spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
              className="w-56 rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 font-mono text-[length:var(--text-meta)] text-ink placeholder:text-faint focus-visible:border-line-strong focus-visible:outline-none"
            />
            <button
              type="button"
              disabled={draft.trim() === settings.search.searxngUrl}
              onClick={() => void saveUrl()}
              className={BUTTON}
            >
              Save
            </button>
          </div>
        </Row>
      )}

      <Row
        label="Try it"
        hint={test.status === 'done' ? test.note : 'Runs one search with the saved settings.'}
      >
        <button
          type="button"
          disabled={test.status === 'running' || (!usesBrowser && !settings.search.searxngUrl)}
          onClick={() => void runTest()}
          className={BUTTON}
        >
          {test.status === 'running' ? 'Searching…' : 'Test'}
        </button>
      </Row>

      <p className="pt-3 text-[length:var(--text-micro)] leading-snug text-faint">
        When a chat searches, its queries go to the source above and the pages it reads are
        requested from this Mac, in a hidden browser that cannot reach your local network and keeps
        no cookies. Page text is sent to the chat’s model.
      </p>
    </section>
  )
}
