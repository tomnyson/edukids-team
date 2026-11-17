import type { Company } from '@shared/types'

/** Where things stand in the classroom. Units are metres on the floor plane: x across, z towards the viewer. */

export interface Spot {
  readonly x: number
  readonly z: number
}

/** Which way a seat looks: out over the class, or towards the board on the back wall. */
export type Facing = 'class' | 'board'

export interface DeskSpot extends Spot {
  readonly facing: Facing
}

export const FLOOR = { width: 16, depth: 12 } as const

/** Desks the room holds; a larger team's extra members are listed in the side panel only. */
export const MAX_DESKS = 8

/** Closest two desks may stand, centre to centre. */
export const MIN_DESK_GAP = 2.5

/** Where a proposed member waits until the user decides. */
export const DOOR_SPOT: Spot = { x: 6.5, z: 4.6 }

const LEAD_SPOT: DeskSpot = { x: 0, z: -3.6, facing: 'class' }
const ROW_DEPTHS = [-0.4, 2.6] as const
const DESK_SPACING = 3
const ROW_CAPACITY = 4

const row = (count: number, z: number): readonly DeskSpot[] =>
  Array.from({ length: count }, (_, index) => ({
    x: (index - (count - 1) / 2) * DESK_SPACING,
    z,
    facing: 'board'
  }))

/**
 * A desk per member, the lead's first: at the board, facing the team in its two rows.
 * The same count always gives the same seats, so nobody jumps desks between renders.
 */
export function deskSpots(memberCount: number): readonly DeskSpot[] {
  const count = Math.min(Math.max(memberCount, 0), MAX_DESKS)
  if (count === 0) return []
  const team = count - 1
  const front = Math.min(Math.ceil(team / 2), ROW_CAPACITY)
  return [LEAD_SPOT, ...row(front, ROW_DEPTHS[0]), ...row(team - front, ROW_DEPTHS[1])]
}

type Team = Pick<Company, 'defaultMode' | 'moderatorMemberId'> & {
  readonly members?: readonly { readonly id: number }[]
}

/** Who runs the meeting: the moderator of a roundtable, the first member of a pipeline. */
export function leadMemberId(company: Team): number | null {
  const members = company.members ?? []
  const first = members[0]?.id ?? null
  if (company.defaultMode !== 'roundtable') return first
  return members.find((member) => member.id === company.moderatorMemberId)?.id ?? first
}
