import { Canvas } from '@react-three/fiber'
// Imported one by one: the package's index pulls in every helper it has
import { OrbitControls } from '@react-three/drei/core/OrbitControls'
import { Html } from '@react-three/drei/web/Html'
import type { MemberProposal } from '@shared/proposals'
import { isThinking, statusLabel } from '@renderer/lib/office/agent-state'
import { DOOR_SPOT } from '@renderer/lib/office/layout'
import type { OfficePrefs } from '@renderer/lib/office/prefs'
import { OfficeAvatar } from './OfficeAvatar'
import { Desk, Room } from './OfficeFurniture'
import { COLORS, hairOf, PALETTES, skinOf } from './palette'
import type { OfficeAgent } from './types'

interface OfficeSceneProps {
  readonly agents: readonly OfficeAgent[]
  readonly pending: readonly MemberProposal[]
  readonly selectedId: number | null
  readonly onSelect: (memberId: number | null) => void
  readonly prefs: OfficePrefs
  /** False under reduced motion. */
  readonly animate: boolean
  /** Where the floating tags are put: one layer over the canvas that outlives every tag. */
  readonly labelLayer: React.RefObject<HTMLDivElement | null>
  /** Shown instead when the machine cannot start WebGL. */
  readonly fallback: React.ReactNode
}

const CAMERA = { position: [12, 11, 12] as const, zoom: 46, near: 0.1, far: 100 }
const LABEL_HEIGHT = 2.15
const TAG =
  'pointer-events-none whitespace-nowrap rounded-[var(--radius-pill)] border px-2 py-0.5 font-mono text-[10px] tracking-[0.06em] shadow-[0_4px_14px_-6px_var(--c-shadow)]'
const TAG_TONE = {
  working: 'border-accent-bright bg-canvas/90 text-ink',
  done: 'border-line bg-canvas/85 text-ok',
  idle: 'border-line bg-canvas/70 text-faint',
  pending: 'border-warn bg-canvas/90 text-warn'
} as const

const DOT_DELAYS_MS = [0, 160, 320] as const

/** Three dots over a member who has the floor but has not written anything yet. */
function ThinkingDots(): React.JSX.Element {
  return (
    <span
      role="img"
      aria-label="thinking"
      className="pointer-events-none flex items-center gap-1 rounded-[var(--radius-pill)] border border-accent-bright bg-canvas/90 px-2 py-1.5 shadow-[0_4px_14px_-6px_var(--c-shadow)]"
    >
      {DOT_DELAYS_MS.map((delay) => (
        <span
          key={delay}
          style={{ animationDelay: `${delay}ms` }}
          className="size-1.5 rounded-full bg-ink motion-safe:animate-bounce"
        />
      ))}
    </span>
  )
}

interface SeatProps {
  readonly agent: OfficeAgent
  readonly selected: boolean
  readonly showLabel: boolean
  readonly labelLayer: React.RefObject<HTMLDivElement | null>
  readonly animate: boolean
  readonly onSelect: (memberId: number) => void
}

function Seat({
  agent,
  selected,
  showLabel,
  labelLayer,
  animate,
  onSelect
}: SeatProps): React.JSX.Element | null {
  const { member, activity, spot } = agent
  if (!spot) return null
  const working = activity.status === 'working'
  const thinking = isThinking(activity)
  const ring = working ? COLORS.working : selected ? COLORS.selected : null

  return (
    <group
      position={[spot.x, 0, spot.z]}
      rotation={[0, spot.facing === 'board' ? Math.PI : 0, 0]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(member.id)
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      <Desk screenOn={working} teacher={agent.isLead} />
      <group position={[0, 0, -0.75]}>
        <OfficeAvatar
          shirt={member.avatarColor}
          skin={skinOf(member.id)}
          hair={hairOf(member.id)}
          seated
          // Hands only move once there is something to type
          working={working && !thinking}
          animate={animate}
        />
        {ring ? (
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.55, 0.68, 40]} />
            <meshBasicMaterial color={ring} transparent opacity={working ? 0.9 : 0.6} />
          </mesh>
        ) : null}
      </group>

      {showLabel || thinking ? (
        <Html
          position={[0, LABEL_HEIGHT, -0.75]}
          center
          zIndexRange={[20, 0]}
          portal={labelLayer as React.RefObject<HTMLElement>}
        >
          <span className="flex flex-col items-center gap-1">
            {thinking ? <ThinkingDots /> : null}
            {showLabel ? (
              <span className={`${TAG} ${TAG_TONE[activity.status]}`}>
                {member.name} · {statusLabel(activity)}
              </span>
            ) : null}
          </span>
        </Html>
      ) : null}
    </group>
  )
}

/** The room itself. Draws what it is given and reports clicks; it holds no state of its own. */
export function OfficeScene({
  agents,
  pending,
  selectedId,
  onSelect,
  prefs,
  animate,
  labelLayer,
  fallback
}: OfficeSceneProps): React.JSX.Element {
  const palette = PALETTES[prefs.lighting]
  const shadows = !prefs.lowPerformance
  const busy = agents.some((agent) => agent.activity.status === 'working')

  return (
    <Canvas
      orthographic
      camera={CAMERA}
      shadows={shadows ? 'percentage' : false}
      dpr={prefs.lowPerformance ? 1 : [1, 2]}
      // Frames are only drawn while somebody is moving; an idle office costs nothing
      frameloop={busy && animate ? 'always' : 'demand'}
      fallback={fallback}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={[palette.background]} />
      <ambientLight intensity={palette.ambient} />
      <directionalLight
        position={[6, 12, 8]}
        intensity={palette.sun}
        color={palette.sunColor}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />

      <Room palette={palette} />

      {agents.map((agent) => (
        <Seat
          key={agent.member.id}
          agent={agent}
          selected={agent.member.id === selectedId}
          showLabel={prefs.labels}
          labelLayer={labelLayer}
          animate={animate}
          onSelect={onSelect}
        />
      ))}

      {/* Proposed members wait by the door, side by side, until the user decides */}
      {pending.map((proposal, index) => (
        <group key={proposal.id} position={[DOOR_SPOT.x - index * 0.9, 0, DOOR_SPOT.z]}>
          <OfficeAvatar
            shirt={COLORS.working}
            skin={skinOf(proposal.id)}
            hair={hairOf(proposal.id)}
            seated={false}
            working={false}
            ghost
            animate={animate}
          />
          {prefs.labels ? (
            <Html
              position={[0, LABEL_HEIGHT + 0.2, 0]}
              center
              zIndexRange={[20, 0]}
              portal={labelLayer as React.RefObject<HTMLElement>}
            >
              <span className={`${TAG} ${TAG_TONE.pending}`}>{proposal.name} · PENDING</span>
            </Html>
          ) : null}
        </group>
      ))}

      <OrbitControls
        target={[0, 0.6, 0.4]}
        enablePan={false}
        minZoom={30}
        maxZoom={110}
        minPolarAngle={0.55}
        maxPolarAngle={1.2}
        minAzimuthAngle={0.1}
        maxAzimuthAngle={1.45}
      />
    </Canvas>
  )
}
