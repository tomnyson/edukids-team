import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SystemInfo } from '@shared/types'
import { useConversations } from './hooks/useConversations'
import { useProjects } from './hooks/useProjects'
import { Sidebar } from './components/sidebar/Sidebar'
import { ChatPane } from './components/chat/ChatPane'
import { ErrorNotice } from './components/ui/ErrorNotice'
import { SettingsDialog } from './components/settings/SettingsDialog'

export function App(): React.JSX.Element {
  const { conversations, activeId, error, select, refresh, create, remove } = useConversations()
  const projects = useProjects()
  const [system, setSystem] = useState<SystemInfo | null | undefined>(undefined)
  const [dismissed, setDismissed] = useState(false)
  const [railHidden, setRailHidden] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void window.api.systemInfo().then((result) => setSystem(result.ok ? result.data : null))
  }, [])

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId]
  )

  // The chat inherits its project's model and effort before the global ones.
  const activeProject = useMemo(
    () => projects.projects.find((project) => project.id === active?.projectId) ?? null,
    [projects.projects, active]
  )

  const onConversationChanged = useCallback(() => {
    void refresh()
  }, [refresh])

  // undefined while the check is in flight, null once it has failed.
  const claudeBinary = system === undefined ? undefined : (system?.claudeBinary ?? null)

  return (
    <div className="flex h-full">
      {railHidden ? null : (
        <Sidebar
          conversations={conversations}
          projects={projects.projects}
          activeId={activeId}
          claudeBinary={claudeBinary}
          onSelect={select}
          onCreate={(projectId) => void create(projectId)}
          onDelete={(id) => void remove(id)}
          onAddProject={() => void projects.add()}
          onUpdateProject={(id, patch) => void projects.update(id, patch)}
          onRemoveProject={(id) => {
            void projects.remove(id).then(refresh)
          }}
          onCollapse={() => setRailHidden(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        {error && !dismissed ? (
          <div className="px-6 pt-4">
            <ErrorNotice
              error={{ code: 'DB_ERROR', message: error }}
              onDismiss={() => setDismissed(true)}
            />
          </div>
        ) : null}

        {/* Keyed so switching conversations remounts the transcript state. */}
        <ChatPane
          key={activeId ?? 'none'}
          conversation={active}
          project={activeProject}
          appVersion={system?.appVersion ?? null}
          railHidden={railHidden}
          onShowRail={() => setRailHidden(false)}
          onConversationChanged={onConversationChanged}
        />
      </main>

      {settingsOpen ? (
        <SettingsDialog
          appVersion={system?.appVersion ?? null}
          claudeBinary={claudeBinary}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  )
}
