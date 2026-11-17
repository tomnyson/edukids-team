import { FLOOR } from '@renderer/lib/office/layout'
import { Board, WallBand } from './Classroom'
import { COLORS, type ScenePalette } from './palette'

const WALL_HEIGHT = 3.4
const WALL_THICKNESS = 0.2

interface RoomProps {
  readonly palette: ScenePalette
}

/** Floor and the two walls away from the camera: the board and the college's band on the back one. */
export function Room({ palette }: RoomProps): React.JSX.Element {
  const { width, depth } = FLOOR
  return (
    <group>
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[width, 0.2, depth]} />
        <meshStandardMaterial color={palette.floor} />
      </mesh>
      <mesh position={[0, 0.01, -0.4]} receiveShadow>
        <boxGeometry args={[13.5, 0.02, 9]} />
        <meshStandardMaterial color={palette.carpet} />
      </mesh>

      <mesh position={[0, WALL_HEIGHT / 2, -depth / 2]} receiveShadow>
        <boxGeometry args={[width, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color={palette.wall} />
      </mesh>
      <mesh position={[-width / 2, WALL_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, depth]} />
        <meshStandardMaterial color={palette.wall} />
      </mesh>
      <Board />
      <WallBand />

      <Plant position={[-7, 0, -5]} />
      <Plant position={[7, 0, -5]} />
      <Plant position={[-7, 0, 1.4]} />
      <Plant position={[3.4, 0, 5.2]} />
    </group>
  )
}

interface PlacedProps {
  readonly position: readonly [number, number, number]
}

export function Plant({ position }: PlacedProps): React.JSX.Element {
  return (
    <group position={[position[0], position[1], position[2]]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.18, 0.5, 12]} />
        <meshStandardMaterial color={COLORS.pot} />
      </mesh>
      <mesh position={[0, 0.85, 0]} castShadow>
        <sphereGeometry args={[0.42, 12, 10]} />
        <meshStandardMaterial color={COLORS.leaf} flatShading />
      </mesh>
      <mesh position={[0.15, 1.3, 0.05]} castShadow>
        <sphereGeometry args={[0.3, 12, 10]} />
        <meshStandardMaterial color={COLORS.leafDark} flatShading />
      </mesh>
    </group>
  )
}

interface DeskProps {
  /** Lit while its member is writing. */
  readonly screenOn: boolean
  /** The teacher's desk is wider, darker and closed at the front. */
  readonly teacher: boolean
}

const DESK_WIDTH = { teacher: 1.9, student: 1.4 } as const

/** A desk with a screen and a chair behind it, centred on its own origin and facing +z. */
export function Desk({ screenOn, teacher }: DeskProps): React.JSX.Element {
  const width = teacher ? DESK_WIDTH.teacher : DESK_WIDTH.student
  const leg = width / 2 - 0.05
  return (
    <group>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.06, 0.85]} />
        <meshStandardMaterial color={teacher ? COLORS.teacherDesk : COLORS.desk} />
      </mesh>
      {[-leg, leg].map((x) => (
        <mesh key={x} position={[x, 0.36, 0]} castShadow>
          <boxGeometry args={[0.06, 0.72, 0.8]} />
          <meshStandardMaterial color={COLORS.deskLeg} />
        </mesh>
      ))}
      {teacher ? (
        <mesh position={[0, 0.4, 0.38]} castShadow>
          <boxGeometry args={[width - 0.1, 0.62, 0.04]} />
          <meshStandardMaterial color={COLORS.teacherDesk} />
        </mesh>
      ) : null}

      <mesh position={[0, 0.84, 0.12]}>
        <boxGeometry args={[0.08, 0.16, 0.08]} />
        <meshStandardMaterial color={COLORS.monitor} />
      </mesh>
      <mesh position={[0, 1.08, 0.12]} castShadow>
        <boxGeometry args={[0.72, 0.42, 0.05]} />
        <meshStandardMaterial color={COLORS.monitor} />
      </mesh>
      {/* The screen faces the member, away from the camera; its glow is what shows */}
      <mesh position={[0, 1.08, 0.09]}>
        <boxGeometry args={[0.64, 0.34, 0.01]} />
        <meshStandardMaterial
          color={screenOn ? COLORS.screenOn : COLORS.screenOff}
          emissive={screenOn ? COLORS.screenOn : '#000000'}
          emissiveIntensity={screenOn ? 1.4 : 0}
        />
      </mesh>

      <mesh position={[0, 0.45, -0.75]} castShadow>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
        <meshStandardMaterial color={COLORS.chair} />
      </mesh>
      <mesh position={[0, 0.8, -0.98]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.06]} />
        <meshStandardMaterial color={COLORS.chair} />
      </mesh>
      <mesh position={[0, 0.22, -0.75]}>
        <cylinderGeometry args={[0.04, 0.04, 0.44, 8]} />
        <meshStandardMaterial color={COLORS.chair} />
      </mesh>
    </group>
  )
}
