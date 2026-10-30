import { FaceGlyph } from './BotFace'

interface AppMarkProps {
  readonly className?: string
}

/**
 * The app mark: the bubble face glancing to its right, toward whoever speaks
 * next. Inherits `currentColor`, so one component serves the rail, the header
 * and the empty state.
 */
export function AppMark({ className }: AppMarkProps): React.JSX.Element {
  return (
    <span role="img" aria-label="Claude GUI" className={`inline-flex ${className ?? ''}`}>
      <FaceGlyph eyes="pill" glance={1} className="size-full" />
    </span>
  )
}
