interface UserBubbleProps {
  readonly text: string
}

/** What the user said: a bubble on the right, so the reply on the left reads as the answer. */
export function UserBubble({ text }: UserBubbleProps): React.JSX.Element {
  return (
    <div className="ml-auto w-fit max-w-[85%] rounded-[var(--radius-2xl)] rounded-br-[var(--radius-md)] bg-bubble px-4 py-2.5">
      <p className="selectable whitespace-pre-wrap break-words text-[length:var(--text-body)] leading-[1.55] text-ink">
        {text}
      </p>
    </div>
  )
}
