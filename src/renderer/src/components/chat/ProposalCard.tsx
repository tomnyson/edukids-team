import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { PROPOSAL_LIMITS, type MemberProposal, type ProposalDraft } from '@shared/proposals'
import type { AppError } from '@shared/types'

interface ProposalCardProps {
  readonly proposal: MemberProposal
  readonly onApprove: (id: number, draft: ProposalDraft) => Promise<AppError | null>
  readonly onReject: (id: number) => Promise<AppError | null>
}

const FIELD =
  'w-full rounded-[var(--radius-md)] border border-line bg-canvas px-2.5 py-1.5 text-[length:var(--text-meta)] text-ink placeholder:text-faint focus-visible:border-line-strong focus-visible:outline-none'
const BUTTON =
  'rounded-[var(--radius-md)] border border-line px-3 py-1.5 text-[length:var(--text-meta)] text-ink hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50'
const LABEL = 'block space-y-1 text-[length:var(--text-micro)] text-muted'

const STATUS_NOTE = {
  approved: 'Added to the team. They join from your next prompt.',
  rejected: 'Declined.'
} as const

/** A new member the CEO asked for. Nothing joins the team until the user approves it here. */
export function ProposalCard({
  proposal,
  onApprove,
  onReject
}: ProposalCardProps): React.JSX.Element {
  const [name, setName] = useState(proposal.name)
  const [role, setRole] = useState(proposal.role)
  const [systemPrompt, setSystemPrompt] = useState(proposal.systemPrompt)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = proposal.status === 'pending'
  const complete = name.trim() !== '' && role.trim() !== '' && systemPrompt.trim() !== ''

  const settle = async (action: () => Promise<AppError | null>): Promise<void> => {
    setBusy(true)
    const failure = await action()
    setError(failure?.message ?? null)
    setBusy(false)
  }

  return (
    <section
      aria-label={`Proposed team member ${proposal.name}`}
      className="ml-9 space-y-3 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3"
    >
      <header className="flex items-start gap-2">
        <UserPlus aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-bright" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-[length:var(--text-ui)] font-medium text-ink">
            Proposed team member: {proposal.name} · {proposal.role}
          </p>
          {proposal.reason ? (
            <p className="text-[length:var(--text-meta)] text-muted">{proposal.reason}</p>
          ) : null}
          <p className="font-mono text-[length:var(--text-micro)] text-faint">
            {proposal.provider} · {proposal.modelId}
          </p>
        </div>
      </header>

      {pending ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className={LABEL}>
              Name
              <input
                value={name}
                maxLength={PROPOSAL_LIMITS.name}
                onChange={(event) => setName(event.target.value)}
                className={FIELD}
              />
            </label>
            <label className={LABEL}>
              Role
              <input
                value={role}
                maxLength={PROPOSAL_LIMITS.role}
                onChange={(event) => setRole(event.target.value)}
                className={FIELD}
              />
            </label>
          </div>
          {/* Always in view: these are the instructions the new member will work by */}
          <label className={LABEL}>
            Instructions (written by the CEO — read before approving)
            <textarea
              value={systemPrompt}
              rows={5}
              maxLength={PROPOSAL_LIMITS.systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              className={`${FIELD} resize-y font-mono leading-relaxed`}
            />
          </label>

          <p className="text-[length:var(--text-micro)] leading-snug text-faint">
            A new member answers every prompt, so each one adds a model call. They join from your
            next prompt and can be changed or removed in the team settings.
          </p>

          {error ? (
            <p role="alert" className="text-[length:var(--text-micro)] text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !complete}
              onClick={() =>
                void settle(() => onApprove(proposal.id, { ...proposal, name, role, systemPrompt }))
              }
              className={BUTTON}
            >
              Add to team
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void settle(() => onReject(proposal.id))}
              className={`${BUTTON} text-muted`}
            >
              Decline
            </button>
          </div>
        </>
      ) : (
        <p className="text-[length:var(--text-meta)] text-muted">{STATUS_NOTE[proposal.status]}</p>
      )}
    </section>
  )
}
