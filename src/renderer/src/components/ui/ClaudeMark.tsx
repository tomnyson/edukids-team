interface ClaudeMarkProps {
  readonly className?: string
}

/**
 * The Claude burst, drawn as twelve tapered spokes. Lengths are deliberately
 * uneven — an evenly-spoked wheel reads as a loading spinner, not a mark.
 * Inherits `currentColor` so one component serves the rail, the header and the
 * empty state at three different sizes.
 */
const SPOKES = [10, 8.5, 9.4, 8.1, 10, 8.7, 9.5, 8.3, 10, 8.5, 9.4, 8.1]

export function ClaudeMark({ className }: ClaudeMarkProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Claude"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
    >
      {SPOKES.map((length, index) => {
        const angle = (index * 30 * Math.PI) / 180
        const sin = Math.sin(angle)
        const cos = Math.cos(angle)
        return (
          <line
            key={index}
            x1={12 + sin * 2.7}
            y1={12 - cos * 2.7}
            x2={12 + sin * length}
            y2={12 - cos * length}
          />
        )
      })}
    </svg>
  )
}
