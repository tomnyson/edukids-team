import { Component, useMemo, useRef, useState } from 'react'
import type { MemberProposal } from '@shared/proposals'
import type { Company } from '@shared/types'
import { activityOf, type OfficeState } from '@renderer/lib/office/agent-state'
import { deskSpots, leadMemberId } from '@renderer/lib/office/layout'
import type { OfficePrefs } from '@renderer/lib/office/prefs'
import type { UpdateOfficePrefs } from '@renderer/hooks/useOfficePrefs'
import { OfficeScene } from './OfficeScene'
import { OfficeSidebar } from './OfficeSidebar'
import type { OfficeAgent } from './types'

interface OfficeViewProps {
  readonly company: Company
  /** Kept by the chat pane, so switching views mid-meeting loses nothing. */
  readonly office: OfficeState
  readonly proposals: readonly MemberProposal[]
  readonly prefs: OfficePrefs
  readonly onPrefsChange: UpdateOfficePrefs
}

const NO_3D =
  'The 3D office could not start on this machine. The team list still shows who is working; switch to Chat for the full transcript.'

function SceneUnavailable(): React.JSX.Element {
  return (
    <div role="alert" className="flex size-full items-center justify-center px-8">
      <p className="max-w-sm text-center text-[length:var(--text-meta)] leading-snug text-muted">
        {NO_3D}
      </p>
    </div>
  )
}

interface BoundaryState {
  readonly failed: boolean
}

/** A renderer crash (a lost GPU context, a driver bug) must not take the chat down with it. */
class SceneBoundary extends Component<{ readonly children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('[office] the 3D scene failed:', error)
  }

  render(): React.ReactNode {
    return this.state.failed ? <SceneUnavailable /> : this.props.children
  }
}

const prefersStill = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A team chat shown as an office: each member at a desk, lit up while they write. */
export default function OfficeView({
  company,
  office,
  proposals,
  prefs,
  onPrefsChange
}: OfficeViewProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [animate] = useState(() => !prefersStill())
  const labelLayer = useRef<HTMLDivElement>(null)

  const agents = useMemo((): readonly OfficeAgent[] => {
    const members = company.members ?? []
    const leadId = leadMemberId(company)
    // The lead takes the first desk, whatever their place in the member list
    const ordered = [...members].sort((a, b) => Number(b.id === leadId) - Number(a.id === leadId))
    const spots = deskSpots(ordered.length)
    return ordered.map((member, index) => ({
      member,
      activity: activityOf(office, member.id),
      spot: spots[index] ?? null,
      isLead: member.id === leadId
    }))
  }, [company, office])

  const pending = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'pending'),
    [proposals]
  )

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1" aria-label="3D office" role="img">
        {/* The tags' own layer: left to itself, the tag helper re-parents them once the canvas
            connects its events, and the first one mounted is lost in the move */}
        <div
          ref={labelLayer}
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        />
        <SceneBoundary>
          <OfficeScene
            agents={agents}
            pending={pending}
            selectedId={selectedId}
            onSelect={setSelectedId}
            prefs={prefs}
            animate={animate}
            labelLayer={labelLayer}
            fallback={<SceneUnavailable />}
          />
        </SceneBoundary>
        <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[length:var(--text-micro)] text-faint">
          drag to turn · scroll to zoom · click someone to inspect
        </p>
      </div>

      <OfficeSidebar
        agents={agents}
        pending={pending}
        selectedId={selectedId}
        onSelect={setSelectedId}
        prefs={prefs}
        onPrefsChange={onPrefsChange}
      />
    </div>
  )
}
