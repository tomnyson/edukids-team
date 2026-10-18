import React, { useState, useEffect } from 'react'
import { KeyRound, Check, AlertCircle, RefreshCw } from 'lucide-react'
import type { ProviderId } from '@shared/types'
import { Dialog } from '@renderer/components/ui/Dialog'

interface ProviderSettingsModalProps {
  readonly onClose: () => void
}

const PROVIDERS: readonly { id: ProviderId; label: string; placeholder: string; defaultUrl?: string }[] = [
  { id: 'opencode', label: 'OpenCode CLI (Free)', placeholder: 'No key needed (local CLI)', defaultUrl: '/opt/homebrew/bin/opencode' },
  { id: 'xai', label: 'xAI Grok', placeholder: 'xai-...', defaultUrl: 'https://api.x.ai/v1' },
  { id: 'anthropic', label: 'Anthropic Claude', placeholder: 'sk-ant-...', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', defaultUrl: 'https://openai.com/v1' },
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIzaSy...', defaultUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...', defaultUrl: 'https://api.deepseek.com/v1' },
  { id: 'ollama', label: 'Local (Ollama / LM Studio)', placeholder: 'No key needed', defaultUrl: 'http://localhost:11434/v1' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...', defaultUrl: 'https://openrouter.ai/api/v1' }
]

export function ProviderSettingsModal({ onClose }: ProviderSettingsModalProps): React.JSX.Element {
  const [configs, setConfigs] = useState<Record<ProviderId, { apiKey: string; baseUrl: string; enabled: boolean }>>({
    opencode: { apiKey: '', baseUrl: '', enabled: true },
    xai: { apiKey: '', baseUrl: '', enabled: true },
    anthropic: { apiKey: '', baseUrl: '', enabled: true },
    openai: { apiKey: '', baseUrl: '', enabled: true },
    gemini: { apiKey: '', baseUrl: '', enabled: true },
    deepseek: { apiKey: '', baseUrl: '', enabled: true },
    ollama: { apiKey: '', baseUrl: 'http://localhost:11434/v1', enabled: true },
    openrouter: { apiKey: '', baseUrl: '', enabled: true }
  })
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('opencode')
  const [testStatus, setTestStatus] = useState<Record<ProviderId, 'idle' | 'testing' | 'success' | 'error'>>({
    opencode: 'idle',
    xai: 'idle',
    anthropic: 'idle',
    openai: 'idle',
    gemini: 'idle',
    deepseek: 'idle',
    ollama: 'idle',
    openrouter: 'idle'
  })
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    window.api.providers.getAll().then((res) => {
      if (res.ok && res.data) {
        const next = { ...configs }
        for (const item of res.data) {
          next[item.id] = {
            apiKey: item.apiKey ?? '',
            baseUrl: item.baseUrl ?? '',
            enabled: item.enabled
          }
        }
        setConfigs(next)
      }
    })
  }, [])

  const handleSave = async (id: ProviderId): Promise<void> => {
    const current = configs[id]
    const res = await window.api.providers.set({
      id,
      apiKey: current.apiKey.trim() || null,
      baseUrl: current.baseUrl.trim() || null,
      enabled: current.enabled
    })
    if (res.ok) {
      setSaveMessage(`Saved ${id} settings`)
      setTimeout(() => setSaveMessage(null), 2000)
    }
  }

  const handleTest = async (id: ProviderId): Promise<void> => {
    setTestStatus((prev) => ({ ...prev, [id]: 'testing' }))
    const current = configs[id]
    const res = await window.api.providers.testConnection({
      id,
      apiKey: current.apiKey.trim() || null,
      baseUrl: current.baseUrl.trim() || null,
      enabled: current.enabled
    })
    setTestStatus((prev) => ({ ...prev, [id]: res.ok ? 'success' : 'error' }))
    setTimeout(() => {
      setTestStatus((prev) => ({ ...prev, [id]: 'idle' }))
    }, 4000)
  }

  const current = configs[selectedProvider]
  const currentMeta = PROVIDERS.find((p) => p.id === selectedProvider)

  return (
    <Dialog title="Model Providers & API Keys" onClose={onClose}>
      <div className="flex h-full w-full divide-x divide-zinc-800">
        {/* Provider List */}
        <div className="w-48 p-3 space-y-1 bg-zinc-950/60 overflow-y-auto">
          <div className="px-2 pb-2 text-[11px] font-mono font-medium text-zinc-500 uppercase tracking-wider">
            Providers
          </div>
          {PROVIDERS.map((p) => {
            const hasKey = Boolean(configs[p.id]?.apiKey) || p.id === 'ollama' || p.id === 'opencode'
            const isSelected = p.id === selectedProvider
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProvider(p.id)}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-mono transition-colors text-left ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 font-semibold border border-cyan-500/30'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
              >
                <span>{p.label}</span>
                {hasKey ? (
                  <span className="size-1.5 rounded-full bg-emerald-400" title="Configured" />
                ) : (
                  <span className="size-1.5 rounded-full bg-zinc-600" title="Missing Key" />
                )}
              </button>
            )
          })}
        </div>

        {/* Configuration Panel */}
        <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <KeyRound className="size-4 text-cyan-400" />
                {currentMeta?.label} Settings
              </h3>
              {saveMessage && (
                <span className="text-xs font-mono text-emerald-400 animate-fade-in">{saveMessage}</span>
              )}
            </div>

            {selectedProvider === 'opencode' && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md text-xs text-emerald-300 space-y-1 font-mono">
                <div className="font-semibold flex items-center gap-1.5">
                  <span className="text-base">⚡</span> 100% Free AI CLI Models
                </div>
                <p className="text-[11px] text-zinc-400">
                  OpenCode CLI provides completely free models (e.g. Mimo Flash Free, Nemotron Lightning Free, Step 5 Preview Free) with full reasoning traces (`Thinking:` blocks) and zero API keys needed.
                </p>
              </div>
            )}

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">
                  {selectedProvider === 'opencode' ? 'API Key (Not Required)' : 'API Key'}
                </label>
                <input
                  type="password"
                  value={current.apiKey}
                  disabled={selectedProvider === 'opencode'}
                  onChange={(e) =>
                    setConfigs((prev) => ({
                      ...prev,
                      [selectedProvider]: { ...prev[selectedProvider], apiKey: e.target.value }
                    }))
                  }
                  placeholder={currentMeta?.placeholder}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">
                  {selectedProvider === 'opencode' ? 'Custom Binary / CLI Path' : 'Custom Base URL'}{' '}
                  <span className="text-zinc-500">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={current.baseUrl}
                  onChange={(e) =>
                    setConfigs((prev) => ({
                      ...prev,
                      [selectedProvider]: { ...prev[selectedProvider], baseUrl: e.target.value }
                    }))
                  }
                  placeholder={currentMeta?.defaultUrl}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 placeholder-zinc-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => handleTest(selectedProvider)}
              disabled={testStatus[selectedProvider] === 'testing'}
              className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              {testStatus[selectedProvider] === 'testing' ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin text-cyan-400" />
                  Testing...
                </>
              ) : testStatus[selectedProvider] === 'success' ? (
                <>
                  <Check className="size-3.5 text-emerald-400" />
                  Connection OK
                </>
              ) : testStatus[selectedProvider] === 'error' ? (
                <>
                  <AlertCircle className="size-3.5 text-red-400" />
                  Failed
                </>
              ) : (
                'Test Connection'
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSave(selectedProvider)}
              className="rounded-md bg-cyan-500 px-4 py-1.5 text-xs font-mono font-medium text-black hover:bg-cyan-400 transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
