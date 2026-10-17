import React, { useState, useEffect } from 'react'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

interface ReasoningBlockProps {
  readonly reasoning: string
  readonly isStreaming?: boolean
}

export function ReasoningBlock({
  reasoning,
  isStreaming = false
}: ReasoningBlockProps): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(isStreaming)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => setSeconds((s) => s + 0.1), 100)
    return () => clearInterval(interval)
  }, [isStreaming])

  // Automatically expand while streaming
  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true)
    }
  }, [isStreaming])

  if (!reasoning && !isStreaming) return null

  return (
    <div className="my-2.5 overflow-hidden rounded-lg border border-cyan-500/25 bg-black/40 text-xs shadow-sm shadow-cyan-950/20">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-1.5 font-mono text-cyan-400/90 transition-colors hover:bg-cyan-500/10"
      >
        <div className="flex items-center gap-2">
          <Brain
            aria-hidden
            className={`size-3.5 ${isStreaming ? 'animate-pulse text-cyan-300' : 'text-cyan-500/70'}`}
          />
          <span className="font-medium tracking-tight">
            {isStreaming ? `Thinking (${seconds.toFixed(1)}s)...` : 'Thought Process'}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown aria-hidden className="size-3.5 text-cyan-500/70" />
        ) : (
          <ChevronRight aria-hidden className="size-3.5 text-cyan-500/70" />
        )}
      </button>

      {isOpen ? (
        <div className="max-h-80 overflow-y-auto border-t border-cyan-500/15 px-3 pt-2 pb-2.5 font-mono text-[11px] leading-relaxed text-zinc-400 whitespace-pre-wrap select-text">
          {reasoning || <span className="italic text-zinc-600">Analyzing reasoning traces...</span>}
        </div>
      ) : null}
    </div>
  )
}
