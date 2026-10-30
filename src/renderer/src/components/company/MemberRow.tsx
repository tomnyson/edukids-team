import React, { useState } from 'react'
import { AlertTriangle, Bot, Pencil, Trash2 } from 'lucide-react'
import type { CompanyMember, ModelOption } from '@shared/types'

interface MemberRowProps {
  readonly member: CompanyMember
  readonly models: readonly ModelOption[]
  readonly onChangeModel: (memberId: number, modelId: string) => void
  readonly onDelete: (memberId: number) => void
}

export function MemberRow({
  member,
  models,
  onChangeModel,
  onDelete
}: MemberRowProps): React.JSX.Element {
  const [isEditingModel, setIsEditingModel] = useState(false)
  // Only flag the model once the provider's list has loaded, so a slow scan is not shown as an error
  const isUnknownModel = models.length > 0 && !models.some((m) => m.id === member.modelId)

  const handleSelect = (modelId: string): void => {
    setIsEditingModel(false)
    if (modelId !== member.modelId) onChangeModel(member.id, modelId)
  }

  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg border border-zinc-800 bg-zinc-900/60 font-mono text-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="size-7 shrink-0 rounded flex items-center justify-center font-bold text-xs"
          style={{
            backgroundColor: `${member.avatarColor}20`,
            color: member.avatarColor
          }}
        >
          <Bot className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-100">{member.name}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: `${member.avatarColor}20`,
                color: member.avatarColor
              }}
            >
              {member.role}
            </span>
          </div>
          {isEditingModel ? (
            <select
              autoFocus
              value={member.modelId}
              onChange={(e) => handleSelect(e.target.value)}
              onBlur={() => setIsEditingModel(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setIsEditingModel(false)
                }
              }}
              className="mt-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-100"
            >
              {isUnknownModel && (
                <option value={member.modelId}>{member.modelId} (not in list)</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.free ? '🆓 ' : ''}
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-0.5">
              <span>
                {member.provider} · {member.modelId}
              </span>
              {isUnknownModel && (
                <span
                  className="flex items-center gap-0.5 text-amber-400"
                  title={`"${member.modelId}" is not in the ${member.provider} model list`}
                >
                  <AlertTriangle className="size-3" />
                  unknown model
                </span>
              )}
              {models.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsEditingModel(true)}
                  className="p-0.5 text-zinc-600 hover:text-cyan-400"
                  title="Change model"
                >
                  <Pencil className="size-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDelete(member.id)}
        className="text-zinc-600 hover:text-red-400 p-1"
        title="Remove Member"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}
