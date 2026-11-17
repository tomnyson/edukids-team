import type { MemberProposal } from '@shared/proposals'
import { statusLabel } from '@renderer/lib/office/agent-state'
import { LIGHTINGS, type Lighting, type OfficePrefs } from '@renderer/lib/office/prefs'
import type { UpdateOfficePrefs } from '@renderer/hooks/useOfficePrefs'
import type { OfficeAgent } from './types'

interface OfficeSidebarProps {
  readonly agents: readonly OfficeAgent[]
  readonly pending: readonly MemberProposal[]
  readonly selectedId: number | null
  readonly onSelect: (memberId: number | null) => void
  readonly prefs: OfficePrefs
  readonly onPrefsChange: UpdateOfficePrefs
}

const PANEL = 'rounded-[var(--radius-md)] border border-line bg-surface'
const HEADING = 'text-[length:var(--text-ui)] font-semibold text-ink'
const META = 'text-[length:var(--text-micro)] text-faint'
const DOT = {
  working: 'bg-accent-bright motion-safe:animate-pulse',
  done: 'bg-ok',
  idle: 'bg-line-strong'
} as const

function AgentDetail({ agent }: { readonly agent: OfficeAgent | null }): React.JSX.Element {
  if (!agent) {
    return (
      <p className="text-[length:var(--text-meta)] leading-snug text-muted">
        Pick someone in the office, or a row below, to see what they are working on.
      </p>
    )
  }
  const { member, activity, isLead } = agent
  return (
    <div className="space-y-2">
      <div>
        <p className={HEADING}>
          {member.name}
          {isLead ? <span className={`ml-2 font-normal ${META}`}>leads the meeting</span> : null}
        </p>
        <p className="text-[length:var(--text-meta)] text-muted">{member.role}</p>
        <p className={`font-mono ${META}`}>
          {member.provider} · {member.modelId}
        </p>
      </div>
      <p className="font-mono text-[length:var(--text-micro)] tracking-[0.06em] text-ink">
        {statusLabel(activity)}
      </p>
      {activity.excerpt ? (
        <p className="selectable max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-2 text-[length:var(--text-micro)] leading-relaxed whitespace-pre-wrap text-muted">
          {activity.excerpt}
        </p>
      ) : (
        <p className={META}>Nothing written yet in this session.</p>
      )}
      {!agent.spot ? <p className={META}>No desk left in the room for this member.</p> : null}
    </div>
  )
}

interface ToggleRowProps {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

function ToggleRow({ label, checked, onChange }: ToggleRowProps): React.JSX.Element {
  return (
    <label className="flex items-center justify-between gap-3 text-[length:var(--text-meta)] text-muted">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--c-accent)]"
      />
    </label>
  )
}

/**
 * Everything the room shows, as plain text and controls: the same team and statuses, reachable
 * by keyboard and screen reader, which a canvas is not.
 */
export function OfficeSidebar({
  agents,
  pending,
  selectedId,
  onSelect,
  prefs,
  onPrefsChange
}: OfficeSidebarProps): React.JSX.Element {
  const selected = agents.find((agent) => agent.member.id === selectedId) ?? null
  const working = agents.filter((agent) => agent.activity.status === 'working').length

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto py-3 pr-4">
      <section aria-label="Agent detail" className={`${PANEL} space-y-2 p-3`}>
        <h2 className={HEADING}>Agent detail</h2>
        <AgentDetail agent={selected} />
      </section>

      <section aria-label="Team" className={`${PANEL} p-3`}>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className={HEADING}>Team</h2>
          <span className={META} role="status">
            {working > 0 ? `${working} working now` : 'Nobody working'}
          </span>
        </div>
        <ul className="space-y-1">
          {agents.map(({ member, activity }) => (
            <li key={member.id}>
              <button
                type="button"
                aria-pressed={member.id === selectedId}
                onClick={() => onSelect(member.id === selectedId ? null : member.id)}
                className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] border px-2 py-1.5 text-left transition-colors duration-[var(--duration-fast)] ${
                  member.id === selectedId
                    ? 'border-line-strong bg-canvas'
                    : 'border-transparent hover:bg-canvas'
                }`}
              >
                <span
                  aria-hidden
                  className={`size-2 shrink-0 rounded-full ${DOT[activity.status]}`}
                />
                <span className="min-w-0 flex-1 truncate text-[length:var(--text-meta)] text-ink">
                  {member.name}
                </span>
                <span className={`shrink-0 font-mono ${META}`}>{statusLabel(activity)}</span>
              </button>
            </li>
          ))}
          {pending.map((proposal) => (
            <li
              key={`proposal-${proposal.id}`}
              className="flex items-center gap-2 px-2 py-1.5 text-[length:var(--text-meta)] text-muted"
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-warn" />
              <span className="min-w-0 flex-1 truncate">{proposal.name}</span>
              <span className={`shrink-0 font-mono ${META}`}>PENDING · in Chat</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="View settings" className={`${PANEL} space-y-2.5 p-3`}>
        <label className="flex items-center justify-between gap-3 text-[length:var(--text-meta)] text-muted">
          Lighting
          <select
            aria-label="Lighting"
            value={prefs.lighting}
            onChange={(event) => onPrefsChange({ lighting: event.target.value as Lighting })}
            className="rounded-[var(--radius-md)] border border-line bg-canvas px-2 py-1 text-[length:var(--text-meta)] text-ink capitalize"
          >
            {LIGHTINGS.map((lighting) => (
              <option key={lighting} value={lighting}>
                {lighting}
              </option>
            ))}
          </select>
        </label>
        <ToggleRow
          label="Status labels"
          checked={prefs.labels}
          onChange={(labels) => onPrefsChange({ labels })}
        />
        <ToggleRow
          label="Low performance mode"
          checked={prefs.lowPerformance}
          onChange={(lowPerformance) => onPrefsChange({ lowPerformance })}
        />
      </section>
    </aside>
  )
}
