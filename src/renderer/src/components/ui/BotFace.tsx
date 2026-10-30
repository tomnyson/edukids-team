import { useId } from 'react'

/**
 * The app's one character: a speech bubble with a face. The app mark, every
 * bot avatar and every chat row are drawn from this single glyph, so a team
 * reads as a cast of the same species rather than a set of stock icons.
 */

type Eyes = 'pill' | 'dot' | 'happy' | 'wink'
type Glance = -1 | 0 | 1

// Rounded bubble with a tail at the lower left, on a 24-unit grid.
const BUBBLE =
  'M10 5H14A6 6 0 0 1 20 11V12A6 6 0 0 1 14 18H10.6L7.4 20.6C6.9 21 6.2 20.6 6.3 20L6.7 17.2A6 6 0 0 1 4 12V11A6 6 0 0 1 10 5Z'

const EYE_LEFT_X = 9.4
const EYE_RIGHT_X = 14.6
const EYE_Y = 11.4
const GLANCE_SHIFT = 1

interface FaceGlyphProps {
  readonly eyes?: Eyes
  readonly glance?: Glance
  readonly className?: string
}

function EyeShapes({
  eyes,
  shift
}: {
  readonly eyes: Eyes
  readonly shift: number
}): React.JSX.Element {
  const left = EYE_LEFT_X + shift
  const right = EYE_RIGHT_X + shift
  const pill = (x: number): React.JSX.Element => (
    <rect x={x - 1.15} y={EYE_Y - 2.2} width={2.3} height={4.4} rx={1.15} fill="black" />
  )

  switch (eyes) {
    case 'dot':
      return (
        <>
          <circle cx={left} cy={EYE_Y} r={1.55} fill="black" />
          <circle cx={right} cy={EYE_Y} r={1.55} fill="black" />
        </>
      )
    case 'happy':
      return (
        <path
          d={`M${left - 1.5} ${EYE_Y + 0.9}q1.5 -2.4 3 0M${right - 1.5} ${EYE_Y + 0.9}q1.5 -2.4 3 0`}
          fill="none"
          stroke="black"
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      )
    case 'wink':
      return (
        <>
          {pill(left)}
          <path
            d={`M${right - 1.4} ${EYE_Y + 0.4}h2.8`}
            stroke="black"
            strokeWidth={1.7}
            strokeLinecap="round"
          />
        </>
      )
    default:
      return (
        <>
          {pill(left)}
          {pill(right)}
        </>
      )
  }
}

/**
 * The bubble face in `currentColor`. Eyes are cut out of the shape rather than
 * painted on, so whatever sits behind the glyph shows through them.
 */
export function FaceGlyph({
  eyes = 'pill',
  glance = 0,
  className
}: FaceGlyphProps): React.JSX.Element {
  const maskId = useId()
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <mask id={maskId}>
        <path d={BUBBLE} fill="white" />
        <EyeShapes eyes={eyes} shift={glance * GLANCE_SHIFT} />
      </mask>
      <rect width="24" height="24" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  )
}

const EYES: readonly Eyes[] = ['pill', 'dot', 'happy', 'wink']
const GLANCES: readonly Glance[] = [0, 1, -1]

function hashSeed(seed: string | number): number {
  const text = String(seed)
  let hash = 0
  for (let index = 0; index < text.length; index++) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

/** Same seed, same face: a bot keeps its expression across renders and restarts. */
function faceFor(seed: string | number): { readonly eyes: Eyes; readonly glance: Glance } {
  const hash = hashSeed(seed)
  return { eyes: EYES[hash % EYES.length], glance: GLANCES[Math.floor(hash / 7) % GLANCES.length] }
}

const SIZES = {
  xs: 'size-5',
  sm: 'size-7',
  md: 'size-9',
  lg: 'size-11'
} as const

export type AvatarSize = keyof typeof SIZES

interface BotAvatarProps {
  /** Picks the expression; speakers use their name so a streaming turn keeps its face. */
  readonly seed: string | number
  /** The bot's identity colour. Omit for a neutral face that carries no identity. */
  readonly color?: string | null
  readonly size?: AvatarSize
  readonly active?: boolean
  readonly className?: string
}

/** A round avatar holding the bubble face, tinted with the bot's own colour. */
export function BotAvatar({
  seed,
  color,
  size = 'sm',
  active = false,
  className = ''
}: BotAvatarProps): React.JSX.Element {
  const face = faceFor(seed)
  const style = color
    ? {
        backgroundColor: `color-mix(in oklch, ${color} 22%, var(--c-surface))`,
        // Bot colours are picked against the dark theme; deepen the face on light.
        color: `light-dark(color-mix(in oklch, ${color} 62%, black), ${color})`
      }
    : undefined
  const neutral = active ? 'bg-accent text-canvas' : 'bg-raised text-muted'

  return (
    <span
      aria-hidden
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full ${SIZES[size]} ${color ? '' : neutral} ${className}`}
    >
      <FaceGlyph eyes={face.eyes} glance={face.glance} className="size-[72%]" />
    </span>
  )
}

interface AvatarStackMember {
  readonly id: number | string
  readonly name: string
  readonly avatarColor?: string | null
}

interface AvatarStackProps {
  readonly members: readonly AvatarStackMember[]
  readonly max?: number
  readonly size?: AvatarSize
}

/** Overlapping avatars for a group chat; each ring is cut from the surface behind it. */
export function AvatarStack({
  members,
  max = 3,
  size = 'xs'
}: AvatarStackProps): React.JSX.Element | null {
  if (members.length === 0) return null
  const shown = members.slice(0, max)
  const extra = members.length - shown.length

  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((member) => (
        <BotAvatar
          key={member.id}
          seed={member.name}
          color={member.avatarColor}
          size={size}
          className="ring-2 ring-[var(--avatar-ring,var(--c-canvas))]"
        />
      ))}
      {extra > 0 ? (
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-raised text-[0.625rem] font-semibold text-muted tabular-nums ring-2 ring-[var(--avatar-ring,var(--c-canvas))] ${SIZES[size]}`}
        >
          +{extra}
        </span>
      ) : null}
    </span>
  )
}
