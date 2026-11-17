import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { BOARD_LINES, WALL_WORDMARK } from '@renderer/lib/office/classroom'
import { FLOOR } from '@renderer/lib/office/layout'
import { COLORS } from './palette'

/** Pixels of texture per metre of wall: enough to stay sharp at the closest zoom. */
const PIXELS_PER_METRE = 256
const TEXT_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const LINE_SPACING = 1.25
/** Share of the plane the lettering may fill, leaving a margin on every side. */
const TEXT_FILL = 0.92

interface Lettering {
  readonly lines: readonly string[]
  readonly width: number
  readonly height: number
  readonly color: string
  readonly weight: number
}

/** The largest size at which every line fits the canvas, across and down. */
function fitFontSize(
  context: CanvasRenderingContext2D,
  lines: readonly string[],
  weight: number,
  width: number,
  height: number
): number {
  const probe = 100
  context.font = `${weight} ${probe}px ${TEXT_FONT}`
  const widest = Math.max(1, ...lines.map((line) => context.measureText(line).width))
  const across = (probe * width * TEXT_FILL) / widest
  const down = (height * TEXT_FILL) / (lines.length * LINE_SPACING)
  return Math.floor(Math.min(across, down))
}

/**
 * Lettering drawn with the machine's own font, so Vietnamese marks come out right and nothing
 * is fetched. Null when the browser gives no 2D canvas; the wall is then simply left blank.
 */
function useLettering({ lines, width, height, color, weight }: Lettering): CanvasTexture | null {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * PIXELS_PER_METRE)
    canvas.height = Math.round(height * PIXELS_PER_METRE)
    const context = canvas.getContext('2d')
    if (!context || lines.length === 0) return null

    const size = fitFontSize(context, lines, weight, canvas.width, canvas.height)
    context.font = `${weight} ${size}px ${TEXT_FONT}`
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    const step = size * LINE_SPACING
    const top = canvas.height / 2 - (step * (lines.length - 1)) / 2
    lines.forEach((line, index) => context.fillText(line, canvas.width / 2, top + index * step))

    const drawn = new CanvasTexture(canvas)
    drawn.colorSpace = SRGBColorSpace
    return drawn
  }, [lines, width, height, color, weight])

  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

interface WallTextProps extends Lettering {
  readonly position: readonly [number, number, number]
}

function WallText({ position, ...lettering }: WallTextProps): React.JSX.Element | null {
  const texture = useLettering(lettering)
  if (!texture) return null
  return (
    <mesh position={[position[0], position[1], position[2]]}>
      <planeGeometry args={[lettering.width, lettering.height]} />
      {/* Unlit, so the writing reads the same by day and by night */}
      <meshBasicMaterial map={texture} transparent toneMapped={false} />
    </mesh>
  )
}

const BOARD = { width: 5.6, height: 1.5, centreY: 2.3, frame: 0.1 } as const
/** How far the board's layers stand off the wall behind them. */
const BOARD_DEPTHS = { frame: 0.13, surface: 0.15, text: 0.17, tray: 0.2 } as const

/** The green board on the back wall, with the greeting chalked on it. */
export function Board(): React.JSX.Element {
  const wall = -FLOOR.depth / 2
  const { width, height, centreY, frame } = BOARD
  return (
    <group>
      <mesh position={[0, centreY, wall + BOARD_DEPTHS.frame]}>
        <boxGeometry args={[width + frame * 2, height + frame * 2, 0.06]} />
        <meshStandardMaterial color={COLORS.boardFrame} />
      </mesh>
      <mesh position={[0, centreY, wall + BOARD_DEPTHS.surface]}>
        <boxGeometry args={[width, height, 0.03]} />
        <meshStandardMaterial color={COLORS.board} />
      </mesh>
      <mesh position={[0, centreY - height / 2 - frame, wall + BOARD_DEPTHS.tray]} castShadow>
        <boxGeometry args={[width * 0.7, 0.05, 0.14]} />
        <meshStandardMaterial color={COLORS.boardFrame} />
      </mesh>
      <WallText
        lines={BOARD_LINES}
        width={width - 0.4}
        height={height - 0.3}
        color={COLORS.chalk}
        weight={600}
        position={[0, centreY, wall + BOARD_DEPTHS.text]}
      />
    </group>
  )
}

const BAND = { width: 4, height: 0.6, centreX: 5.5, centreY: 2.3 } as const

/** An orange band on the back wall beside the board, lettered with the college's name. */
export function WallBand(): React.JSX.Element {
  const wall = -FLOOR.depth / 2
  return (
    <group>
      <mesh position={[BAND.centreX, BAND.centreY, wall + BOARD_DEPTHS.frame]}>
        <boxGeometry args={[BAND.width, BAND.height, 0.04]} />
        <meshStandardMaterial color={COLORS.band} />
      </mesh>
      <WallText
        lines={[WALL_WORDMARK]}
        width={BAND.width - 0.4}
        height={BAND.height - 0.1}
        color={COLORS.bandText}
        weight={800}
        position={[BAND.centreX, BAND.centreY, wall + BOARD_DEPTHS.text]}
      />
    </group>
  )
}
