import type { CompanyMember } from '@shared/types'
import type { AgentActivity } from '@renderer/lib/office/agent-state'
import type { DeskSpot } from '@renderer/lib/office/layout'

/** One team member as the office shows them. `spot` is null when the room has no desk left. */
export interface OfficeAgent {
  readonly member: CompanyMember
  readonly activity: AgentActivity
  readonly spot: DeskSpot | null
  readonly isLead: boolean
}
