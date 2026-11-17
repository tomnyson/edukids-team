import { APP_NAME } from '@shared/brand'
import logo from '@renderer/assets/logo.png'

interface AppMarkProps {
  readonly className?: string
}

/** The app mark. One component serves the rail, the header and the empty state. */
export function AppMark({ className }: AppMarkProps): React.JSX.Element {
  return (
    <img
      src={logo}
      alt={APP_NAME}
      draggable={false}
      className={`inline-block rounded-[22%] object-cover ${className ?? ''}`}
    />
  )
}
