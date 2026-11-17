import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import { COLORS } from './palette'

interface OfficeAvatarProps {
  readonly shirt: string
  readonly skin: string
  readonly hair: string
  /** Sitting at a desk, or standing (someone waiting at the door). */
  readonly seated: boolean
  readonly working: boolean
  /** Drawn see-through: proposed, not on the team yet. */
  readonly ghost?: boolean
  /** Off for reduced motion; the pose then holds still. */
  readonly animate: boolean
}

const TYPING_SPEED = 14
const BREATHING_SPEED = 2

/** A person built from a few primitives. Its own origin is the floor under it; it faces +z. */
export function OfficeAvatar({
  shirt,
  skin,
  hair,
  seated,
  working,
  ghost = false,
  animate
}: OfficeAvatarProps): React.JSX.Element {
  const body = useRef<Group>(null)
  const leftArm = useRef<Mesh>(null)
  const rightArm = useRef<Mesh>(null)

  // Motion is written straight to the objects each frame, the three.js way; React state would
  // re-render the whole office sixty times a second
  useFrame(({ clock }) => {
    if (!animate || !working) return
    const time = clock.elapsedTime
    if (body.current) body.current.position.y = Math.sin(time * BREATHING_SPEED) * 0.012
    if (leftArm.current) leftArm.current.position.y = 0.9 + Math.sin(time * TYPING_SPEED) * 0.025
    if (rightArm.current) {
      rightArm.current.position.y = 0.9 + Math.sin(time * TYPING_SPEED + 1.7) * 0.025
    }
  })

  const opacity = ghost ? 0.45 : 1
  const lift = seated ? 0 : 0.28
  const material = (color: string): React.JSX.Element => (
    <meshStandardMaterial color={color} transparent={ghost} opacity={opacity} />
  )

  return (
    <group ref={body}>
      <group position={[0, lift, 0]}>
        <mesh position={[0, 0.95, 0]} castShadow={!ghost}>
          <capsuleGeometry args={[0.2, 0.38, 6, 12]} />
          {material(shirt)}
        </mesh>
        <mesh position={[0, 1.47, 0]} castShadow={!ghost}>
          <sphereGeometry args={[0.19, 16, 14]} />
          {material(skin)}
        </mesh>
        <mesh position={[0, 1.55, -0.03]}>
          <sphereGeometry args={[0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          {material(hair)}
        </mesh>
        {/* Forearms reach for the keyboard when seated, hang when standing */}
        <mesh
          ref={leftArm}
          position={[-0.24, 0.9, seated ? 0.22 : 0]}
          rotation={[seated ? Math.PI / 2.4 : 0, 0, 0]}
        >
          <capsuleGeometry args={[0.055, 0.34, 4, 8]} />
          {material(shirt)}
        </mesh>
        <mesh
          ref={rightArm}
          position={[0.24, 0.9, seated ? 0.22 : 0]}
          rotation={[seated ? Math.PI / 2.4 : 0, 0, 0]}
        >
          <capsuleGeometry args={[0.055, 0.34, 4, 8]} />
          {material(shirt)}
        </mesh>
      </group>

      {seated ? (
        <mesh position={[0, 0.52, 0.18]}>
          <boxGeometry args={[0.36, 0.14, 0.5]} />
          {material(COLORS.trousers)}
        </mesh>
      ) : (
        <mesh position={[0, 0.42, 0]}>
          <capsuleGeometry args={[0.15, 0.5, 4, 10]} />
          {material(COLORS.trousers)}
        </mesh>
      )}
    </group>
  )
}
