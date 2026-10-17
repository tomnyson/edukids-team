import { useCallback, useEffect, useMemo, useState } from 'react'
import { Briefcase, KeyRound, Sparkles } from 'lucide-react'
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

  const reloadCompanies = useCallback(async () => {
    const res = await window.api.companies.list()
    if (res.ok) {
      setCompanies(res.data)
      if (res.data.length > 0 && activeCompanyId === null) {
        setActiveCompanyId(res.data[0].id)
      }
    }
  }, [activeCompanyId])

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
        {/* Top Company Navigation Bar */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/70 px-4 font-mono text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompanyModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              <Briefcase className="size-3.5 text-cyan-400" />
              <span className="font-semibold">
                {activeCompany ? activeCompany.name : 'Select Company'}
              </span>
            </button>

            {activeCompany && (
              <span className="rounded bg-zinc-900 border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                {activeCompany.members?.length ?? 0} models
              </span>
            )}

            {activeCompany && (
              <button
                type="button"
                onClick={() => setActiveCompanyId(null)}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 underline ml-1"
                title="Switch to solo Claude mode"
              >
                Solo mode
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setProviderModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <KeyRound className="size-3.5 text-amber-400" />
              <span>Providers & Keys</span>
            </button>

            <button
              type="button"
              onClick={() => setCompanyModalOpen(true)}
              className="flex items-center gap-1 rounded-md bg-cyan-500 px-2.5 py-1 font-semibold text-black hover:bg-cyan-400 transition-colors"
            >
              <Sparkles className="size-3" />
              <span>Manage Team</span>
            </button>
          </div>
        </div>

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
