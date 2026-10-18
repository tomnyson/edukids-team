import React, { useState, useEffect } from 'react'
import {
  Briefcase,
  Plus,
  Trash2,
  Users,
  Flame,
  Check,
  Bot,
  Sparkles,
  RefreshCw
} from 'lucide-react'
import type {
  Company,
  CompanyMember,
  ExecutionMode,
  ModelOption,
  ProviderId
} from '@shared/types'
import { Dialog } from '@renderer/components/ui/Dialog'

interface CompanyManagerModalProps {
  readonly activeCompanyId: number | null
  readonly onSelectCompany: (id: number) => void
  readonly onClose: () => void
}

const PRESET_TEMPLATES = [
  {
    name: '100% Free AI Crew (OpenCode)',
    description: 'Fully free multi-agent team running via local OpenCode CLI with thinking blocks.',
    mode: 'roundtable' as ExecutionMode,
    funMode: true,
    members: [
      {
        name: 'Mimo Flash (Free)',
        role: 'Lead Architect',
        provider: 'opencode' as ProviderId,
        modelId: 'opencode/mimo-v2.6-flash-free',
        systemPrompt: 'You are the Lead Architect. Provide fast, structured, and insightful technical design.',
        avatarColor: '#00F0FF'
      },
      {
        name: 'Step 5 Preview (Free)',
        role: 'Senior Coder',
        provider: 'opencode' as ProviderId,
        modelId: 'opencode/step-5-preview-free',
        systemPrompt: 'You are the Senior Coder. Write clean, reliable code with no bloat.',
        avatarColor: '#FF7A00'
      },
      {
        name: 'Nemotron Lightning (Free)',
        role: 'QA & Security Critic',
        provider: 'opencode' as ProviderId,
        modelId: 'opencode/nemotron-3.5-lightning-free',
        systemPrompt: 'You are the QA and Security Critic. Review designs and code for flaws and edge cases.',
        avatarColor: '#10B981'
      }
    ]
  },
  {
    name: 'AI Startup Executive Board',
    description: 'High-velocity tech leadership team with contrasting perspectives.',
    mode: 'roundtable' as ExecutionMode,
    funMode: true,
    members: [
      {
        name: 'Grok 3',
        role: 'Chief Architect',
        provider: 'xai' as ProviderId,
        modelId: 'grok-3',
        systemPrompt: 'You are the Chief Architect. Uncompromising on performance, scalability, and straightforward simplicity. Cut through fluff.',
        avatarColor: '#00F0FF'
      },
      {
        name: 'Claude 3.7 Sonnet',
        role: 'Lead Coder',
        provider: 'anthropic' as ProviderId,
        modelId: 'claude-3-7-sonnet-20250219',
        systemPrompt: 'You are the Lead Software Engineer. Thorough, attentive to code quality, edge cases, and maintainable patterns.',
        avatarColor: '#D97706'
      },
      {
        name: 'DeepSeek R1',
        role: 'Security & QA Critic',
        provider: 'deepseek' as ProviderId,
        modelId: 'deepseek-reasoner',
        systemPrompt: 'You are the Security & Reliability Auditor. Rigorously analyze flaws, vulnerabilities, and logical errors in proposed ideas.',
        avatarColor: '#10B981'
      }
    ]
  },
  {
    name: 'Full-Stack Execution Crew',
    description: 'Pipeline team for building end-to-end features and verifying work.',
    mode: 'pipeline' as ExecutionMode,
    funMode: false,
    members: [
      {
        name: 'Planner Claude',
        role: 'Tech Lead / Planner',
        provider: 'anthropic' as ProviderId,
        modelId: 'claude-3-7-sonnet-20250219',
        systemPrompt: 'You are the Tech Lead. Decompose user requests into structured, actionable engineering tasks.',
        avatarColor: '#00F0FF'
      },
      {
        name: 'Specialist Grok',
        role: 'Full-Stack Developer',
        provider: 'xai' as ProviderId,
        modelId: 'grok-3',
        systemPrompt: 'You are the Full-Stack Developer. Write fast, clean, production-ready code with minimal overhead.',
        avatarColor: '#FF7A00'
      },
      {
        name: 'QA DeepSeek',
        role: 'Test & Review Engineer',
        provider: 'deepseek' as ProviderId,
        modelId: 'deepseek-chat',
        systemPrompt: 'You are the Test Engineer. Validate code correctness, test edge cases, and write unit tests.',
        avatarColor: '#10B981'
      }
    ]
  }
]

export function CompanyManagerModal({
  activeCompanyId,
  onSelectCompany,
  onClose
}: CompanyManagerModalProps): React.JSX.Element {
  const [companies, setCompanies] = useState<readonly Company[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(activeCompanyId)
  const [isCreating, setIsCreating] = useState(false)
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyDesc, setNewCompanyDesc] = useState('')
  const [newCompanyMode, setNewCompanyMode] = useState<ExecutionMode>('roundtable')
  const [newCompanyFun, setNewCompanyFun] = useState(true)

  // Member form state
  const [isAddingMember, setIsAddingMember] = useState(false)
  const [mName, setMName] = useState('')
  const [mRole, setMRole] = useState('')
  const [mProvider, setMProvider] = useState<ProviderId>('opencode')
  const [mModel, setMModel] = useState('')
  const [mPrompt, setMPrompt] = useState('')
  const [mColor, setMColor] = useState('#00F0FF')
  const [availableModels, setAvailableModels] = useState<readonly ModelOption[]>([])
  const [modelsCache, setModelsCache] = useState<Partial<Record<ProviderId, readonly ModelOption[]>>>({})
  const [loadingModels, setLoadingModels] = useState(false)
  const [isCustomModel, setIsCustomModel] = useState(false)
  const COLOR_OPTIONS = ['#00F0FF', '#D97706', '#10B981', '#8B5CF6', '#EC4899']

  const ALL_PROVIDERS: readonly ProviderId[] = [
    'opencode',
    'xai',
    'anthropic',
    'openai',
    'gemini',
    'deepseek',
    'ollama',
    'openrouter'
  ]

  const loadModelsForProvider = async (
    provider: ProviderId,
    forceRefresh = false
  ): Promise<void> => {
    // If already in cache and not forcing refresh, use instantly
    if (!forceRefresh && modelsCache[provider]?.length) {
      const cached = modelsCache[provider]!
      setAvailableModels(cached)
      if (!isCustomModel && (!mModel || !cached.some((m) => m.id === mModel))) {
        setMModel(cached[0].id)
      }
      return
    }

    setLoadingModels(true)
    try {
      const res = await window.api.providers.listModels(provider)
      if (res.ok && res.data.length > 0) {
        setModelsCache((prev) => ({ ...prev, [provider]: res.data }))
        setAvailableModels(res.data)
        if (!isCustomModel && (!mModel || !res.data.some((m) => m.id === mModel))) {
          setMModel(res.data[0].id)
        }
      } else {
        setAvailableModels([])
      }
    } finally {
      setLoadingModels(false)
    }
  }

  // Preload models for all providers eagerly
  useEffect(() => {
    void Promise.all(
      ALL_PROVIDERS.map(async (p) => {
        try {
          const res = await window.api.providers.listModels(p)
          if (res.ok && res.data.length > 0) {
            setModelsCache((prev) => ({ ...prev, [p]: res.data }))
            if (p === mProvider && availableModels.length === 0) {
              setAvailableModels(res.data)
              if (!isCustomModel && !mModel) {
                setMModel(res.data[0].id)
              }
            }
          }
        } catch {
          // ignore background preload error
        }
      })
    )
  }, [])

  useEffect(() => {
    if (isAddingMember) {
      void loadModelsForProvider(mProvider)
    }
  }, [isAddingMember, mProvider])

  const loadCompanies = async (): Promise<void> => {
    const res = await window.api.companies.list()
    if (res.ok) {
      setCompanies(res.data)
      if (res.data.length > 0 && selectedId === null) {
        setSelectedId(res.data[0].id)
      }
    }
  }

  useEffect(() => {
    loadCompanies()
  }, [])

  const currentCompany = companies.find((c) => c.id === selectedId)

  const handleCreateCompany = async (): Promise<void> => {
    if (!newCompanyName.trim()) return
    const res = await window.api.companies.create({
      name: newCompanyName.trim(),
      description: newCompanyDesc.trim() || undefined,
      defaultMode: newCompanyMode,
      funMode: newCompanyFun
    })
    if (res.ok) {
      await loadCompanies()
      setSelectedId(res.data.id)
      setIsCreating(false)
      setNewCompanyName('')
      setNewCompanyDesc('')
    }
  }

  const handleApplyPreset = async (preset: typeof PRESET_TEMPLATES[number]): Promise<void> => {
    const res = await window.api.companies.create({
      name: preset.name,
      description: preset.description,
      defaultMode: preset.mode,
      funMode: preset.funMode
    })
    if (res.ok) {
      const companyId = res.data.id
      for (const m of preset.members) {
        await window.api.companies.addMember({
          companyId,
          name: m.name,
          role: m.role,
          provider: m.provider,
          modelId: m.modelId,
          systemPrompt: m.systemPrompt,
          avatarColor: m.avatarColor
        })
      }
      await loadCompanies()
      setSelectedId(companyId)
    }
  }

  const handleDeleteCompany = async (id: number): Promise<void> => {
    await window.api.companies.delete(id)
    await loadCompanies()
    if (selectedId === id) {
      setSelectedId(companies[0]?.id ?? null)
    }
  }

  const handleAddMember = async (): Promise<void> => {
    if (!selectedId || !mName.trim() || !mRole.trim()) return
    await window.api.companies.addMember({
      companyId: selectedId,
      name: mName.trim(),
      role: mRole.trim(),
      provider: mProvider,
      modelId: mModel.trim() || 'default',
      systemPrompt: mPrompt.trim() || `You are ${mName}, acting as ${mRole}.`,
      avatarColor: mColor
    })
    setIsAddingMember(false)
    setMName('')
    setMRole('')
    setMPrompt('')
    await loadCompanies()
  }

  const handleDeleteMember = async (memberId: number): Promise<void> => {
    await window.api.companies.deleteMember(memberId)
    await loadCompanies()
  }

  return (
    <Dialog title="Manage AI Companies" onClose={onClose}>
      <div className="flex h-full w-full divide-x divide-zinc-800">
        {/* Sidebar Roster of Companies */}
        <div className="w-56 p-3 flex flex-col justify-between bg-zinc-950/70 overflow-y-auto">
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2 pb-2 text-[11px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
              <span>Your Companies</span>
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
              >
                <Plus className="size-3.5" />
                New
              </button>
            </div>

            {companies.map((c) => {
              const isSelected = c.id === selectedId
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setIsCreating(false)
                    setSelectedId(c.id)
                  }}
                  className={`group flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-mono cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                      : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
                >
                  <div className="truncate flex items-center gap-2">
                    <Briefcase className="size-3.5 shrink-0 text-cyan-400/80" />
                    <span className="truncate">{c.name}</span>
                  </div>
                  {c.id === activeCompanyId && (
                    <span className="size-1.5 rounded-full bg-cyan-400" title="Active Company" />
                  )}
                </div>
              )
            })}
          </div>

          <div className="pt-3 border-t border-zinc-800 space-y-1.5">
            <div className="px-2 text-[10px] font-mono text-zinc-500 uppercase">1-Click Presets</div>
            {PRESET_TEMPLATES.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="w-full text-left rounded-md px-2 py-1 text-[11px] font-mono text-zinc-400 hover:bg-zinc-800 hover:text-cyan-300 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="size-3 text-amber-400 shrink-0" />
                <span className="truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 p-5 overflow-y-auto">
          {isCreating ? (
            /* Create new company form */
            <div className="space-y-4 font-mono text-xs">
              <h3 className="text-sm font-semibold text-zinc-100">Create New Company</h3>
              <div>
                <label className="block text-zinc-400 mb-1">Company Name</label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. Fintech Advisory Group"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Description</label>
                <input
                  type="text"
                  value={newCompanyDesc}
                  onChange={(e) => setNewCompanyDesc(e.target.value)}
                  placeholder="e.g. Executive multi-model team for code reviews"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Default Mode</label>
                  <select
                    value={newCompanyMode}
                    onChange={(e) => setNewCompanyMode(e.target.value as ExecutionMode)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="roundtable">🎙️ Roundtable Debate</option>
                    <option value="pipeline">⚡ Task Pipeline</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Fun Mode</label>
                  <button
                    type="button"
                    onClick={() => setNewCompanyFun(!newCompanyFun)}
                    className={`flex items-center gap-1.5 w-full rounded-md border px-3 py-1.5 ${
                      newCompanyFun
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    <Flame className="size-3.5 text-amber-400" />
                    <span>{newCompanyFun ? 'Grok Style Enabled' : 'Normal Professional'}</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCreateCompany}
                  className="rounded-md bg-cyan-500 px-4 py-1.5 font-medium text-black hover:bg-cyan-400"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : currentCompany ? (
            /* Current company details & member list */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <Briefcase className="size-4 text-cyan-400" />
                    {currentCompany.name}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{currentCompany.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedId !== activeCompanyId && (
                    <button
                      type="button"
                      onClick={() => onSelectCompany(currentCompany.id)}
                      className="rounded-md bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 px-3 py-1 text-xs font-mono hover:bg-cyan-500/30 transition-colors flex items-center gap-1"
                    >
                      <Check className="size-3.5" />
                      Set Active
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteCompany(currentCompany.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Delete Company"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              {/* Members section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono font-medium text-zinc-300 flex items-center gap-1.5">
                    <Users className="size-3.5 text-cyan-400" />
                    Team Members ({currentCompany.members?.length ?? 0})
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingMember(true)}
                    className="flex items-center gap-1 text-xs font-mono text-cyan-400 hover:text-cyan-300"
                  >
                    <Plus className="size-3.5" />
                    Add Member
                  </button>
                </div>

                {isAddingMember && (
                  <div className="p-3 mb-3 rounded-lg border border-cyan-500/30 bg-zinc-950 font-mono text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Name (e.g. Grok 3)"
                        value={mName}
                        onChange={(e) => setMName(e.target.value)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                      />
                      <input
                        type="text"
                        placeholder="Role (e.g. Lead Architect)"
                        value={mRole}
                        onChange={(e) => setMRole(e.target.value)}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={mProvider}
                        onChange={(e) => {
                          const p = e.target.value as ProviderId
                          setMProvider(p)
                          setIsCustomModel(false)
                          if (modelsCache[p]?.length) {
                            setAvailableModels(modelsCache[p]!)
                            setMModel(modelsCache[p]![0].id)
                          } else {
                            setAvailableModels([])
                            void loadModelsForProvider(p)
                          }
                        }}
                        className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                      >
                        <option value="opencode">
                          🆓 OpenCode CLI (Free{modelsCache.opencode?.length ? ` · ${modelsCache.opencode.length}` : ''})
                        </option>
                        <option value="xai">
                          xAI Grok{modelsCache.xai?.length ? ` · ${modelsCache.xai.length}` : ''}
                        </option>
                        <option value="anthropic">
                          Anthropic Claude{modelsCache.anthropic?.length ? ` · ${modelsCache.anthropic.length}` : ''}
                        </option>
                        <option value="openai">
                          OpenAI{modelsCache.openai?.length ? ` · ${modelsCache.openai.length}` : ''}
                        </option>
                        <option value="gemini">
                          Google Gemini{modelsCache.gemini?.length ? ` · ${modelsCache.gemini.length}` : ''}
                        </option>
                        <option value="deepseek">
                          DeepSeek{modelsCache.deepseek?.length ? ` · ${modelsCache.deepseek.length}` : ''}
                        </option>
                        <option value="ollama">
                          Local (Ollama / LM Studio{modelsCache.ollama?.length ? ` · ${modelsCache.ollama.length}` : ''})
                        </option>
                        <option value="openrouter">
                          OpenRouter{modelsCache.openrouter?.length ? ` · ${modelsCache.openrouter.length}` : ''}
                        </option>
                      </select>

                      <div className="flex items-center gap-1">
                        {isCustomModel ? (
                          <input
                            type="text"
                            placeholder="Custom Model ID"
                            value={mModel}
                            onChange={(e) => setMModel(e.target.value)}
                            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                          />
                        ) : (
                          <select
                            value={mModel}
                            onChange={(e) => setMModel(e.target.value)}
                            disabled={loadingModels && availableModels.length === 0}
                            className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100 disabled:opacity-50"
                          >
                            {loadingModels && availableModels.length === 0 ? (
                              <option>Scanning models...</option>
                            ) : availableModels.length > 0 ? (
                              availableModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.free ? '🆓 ' : ''}{m.name}
                                </option>
                              ))
                            ) : (
                              <option value="">No models found</option>
                            )}
                          </select>
                        )}

                        <button
                          type="button"
                          onClick={() => void loadModelsForProvider(mProvider, true)}
                          title="Force re-scan models"
                          disabled={loadingModels}
                          className="p-1 rounded border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-cyan-400 disabled:opacity-50"
                        >
                          <RefreshCw className={`size-3.5 ${loadingModels ? 'animate-spin text-cyan-400' : ''}`} />
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsCustomModel(!isCustomModel)}
                          title={isCustomModel ? 'Pick from model list' : 'Enter custom model ID'}
                          className={`px-1.5 py-1 rounded text-[10px] font-mono border ${
                            isCustomModel
                              ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {isCustomModel ? 'List' : 'Custom'}
                        </button>
                      </div>
                    </div>
                    <textarea
                      placeholder="System Prompt / Persona for this member..."
                      value={mPrompt}
                      onChange={(e) => setMPrompt(e.target.value)}
                      rows={2}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 text-[10px]">Color:</span>
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setMColor(c)}
                          className={`size-4 rounded-full border ${mColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleAddMember}
                        className="rounded bg-cyan-500 px-3 py-1 text-black font-semibold"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddingMember(false)}
                        className="text-zinc-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {currentCompany.members?.map((m: CompanyMember) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 font-mono text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="size-7 rounded flex items-center justify-center font-bold text-xs"
                          style={{
                            backgroundColor: `${m.avatarColor}20`,
                            color: m.avatarColor
                          }}
                        >
                          <Bot className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-100">{m.name}</span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: `${m.avatarColor}20`,
                                color: m.avatarColor
                              }}
                            >
                              {m.role}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">
                            {m.provider} · {m.modelId}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteMember(m.id)}
                        className="text-zinc-600 hover:text-red-400 p-1"
                        title="Remove Member"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-500 font-mono text-xs">
              Select or create a company to get started.
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
