import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Company, SystemInfo } from '@shared/types'
import { useConversations } from './hooks/useConversations'
import { useProjects } from './hooks/useProjects'
import { Sidebar } from './components/sidebar/Sidebar'
import { ChatPane } from './components/chat/ChatPane'
import { ErrorNotice } from './components/ui/ErrorNotice'
import { SettingsDialog } from './components/settings/SettingsDialog'
import { CompanyManagerModal } from './components/company/CompanyManagerModal'
import { ProviderSettingsModal } from './components/settings/ProviderSettingsModal'

export function App(): React.JSX.Element {
  const { conversations, activeId, error, select, refresh, create, remove } = useConversations()
  const projects = useProjects()
  const [system, setSystem] = useState<SystemInfo | null | undefined>(undefined)
  const [dismissed, setDismissed] = useState(false)
  const [railHidden, setRailHidden] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Company management state
  const [companies, setCompanies] = useState<readonly Company[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null)
  const [companyModalOpen, setCompanyModalOpen] = useState(false)
  const [providerModalOpen, setProviderModalOpen] = useState(false)

  // The first team is picked for the user once; after that "Solo" has to stick.
  const pickedFirstCompany = useRef(false)

  const reloadCompanies = useCallback(async () => {
    const res = await window.api.companies.list()
    if (res.ok) {
      setCompanies(res.data)
      if (res.data.length > 0 && !pickedFirstCompany.current) {
        pickedFirstCompany.current = true
        setActiveCompanyId((current) => current ?? res.data[0].id)
      }
    }
  }, [])

  useEffect(() => {
    void window.api.systemInfo().then((result) => setSystem(result.ok ? result.data : null))
    void reloadCompanies()
  }, [reloadCompanies])

  const active = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId) ?? null,
    [conversations, activeId]
  )

  const activeProject = useMemo(
    () => projects.projects.find((project) => project.id === active?.projectId) ?? null,
    [projects.projects, active]
  )

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === activeCompanyId) ?? null,
    [companies, activeCompanyId]
  )

  const handleToggleFunMode = useCallback(async () => {
    if (!activeCompany) return
    const nextFun = !activeCompany.funMode
    await window.api.companies.update(activeCompany.id, { funMode: nextFun })
    await reloadCompanies()
  }, [activeCompany, reloadCompanies])

  const onConversationChanged = useCallback(() => {
    void refresh()
  }, [refresh])

  const claudeBinary = system === undefined ? undefined : (system?.claudeBinary ?? null)

  return (
    <div className="flex h-full">
      {railHidden ? null : (
        <Sidebar
          conversations={conversations}
          projects={projects.projects}
          activeId={activeId}
          claudeBinary={claudeBinary}
          company={activeCompany}
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
          onOpenCompany={() => setCompanyModalOpen(true)}
          onOpenProviders={() => setProviderModalOpen(true)}
          onSoloMode={() => setActiveCompanyId(null)}
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

        {/* Keyed so switching conversations or companies remounts the transcript state. */}
        <ChatPane
          key={`${activeId ?? 'none'}-${activeCompanyId ?? 'solo'}`}
          conversation={active}
          project={activeProject}
          appVersion={system?.appVersion ?? null}
          railHidden={railHidden}
          company={activeCompany}
          onToggleFunMode={handleToggleFunMode}
          onShowRail={() => setRailHidden(false)}
          onOpenCompany={() => setCompanyModalOpen(true)}
          onConversationChanged={onConversationChanged}
        />
      </main>

      {companyModalOpen ? (
        <CompanyManagerModal
          activeCompanyId={activeCompanyId}
          onSelectCompany={(id) => {
            setActiveCompanyId(id)
            setCompanyModalOpen(false)
          }}
          onClose={() => {
            setCompanyModalOpen(false)
            reloadCompanies()
          }}
        />
      ) : null}

      {providerModalOpen ? (
        <ProviderSettingsModal onClose={() => setProviderModalOpen(false)} />
      ) : null}

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
