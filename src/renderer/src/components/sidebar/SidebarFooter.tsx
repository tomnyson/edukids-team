import { ChevronsUpDown, KeyRound, Settings2 } from 'lucide-react'
import type { Company } from '@shared/types'
import { AvatarStack, BotAvatar } from '@renderer/components/ui/BotFace'
import { botCount, modeName } from '@renderer/lib/team'

interface SidebarFooterProps {
  readonly company: Company | null
  readonly claudeBinary: string | null | undefined
  readonly onOpenCompany: () => void
  readonly onOpenProviders: () => void
  readonly onOpenSettings: () => void
  readonly onSoloMode: () => void
}

function modeLabel(company: Company): string {
  return `${botCount(company)}, ${modeName(company).toLowerCase()}`
}

/** Who the user is talking to, and the switches around it: the team, keys and settings. */
export function SidebarFooter({
  company,
  claudeBinary,
  onOpenCompany,
  onOpenProviders,
  onOpenSettings,
  onSoloMode
}: SidebarFooterProps): React.JSX.Element {
  const members = company?.members ?? []

  return (
    <footer className="space-y-2 border-t border-line px-3 pt-3 pb-3">
      <button
        type="button"
        onClick={onOpenCompany}
        title="Manage team"
        className="flex w-full items-center gap-2.5 rounded-[var(--radius-xl)] bg-surface px-2.5 py-2 text-left transition-colors duration-[var(--duration-fast)] [--avatar-ring:var(--c-surface)] hover:bg-raised hover:[--avatar-ring:var(--c-raised)] active:scale-[0.99]"
      >
        {members.length > 0 ? (
          <AvatarStack members={members} size="sm" />
        ) : (
          <BotAvatar seed="solo" size="sm" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[length:var(--text-ui)] font-semibold text-ink">
            {company ? company.name : 'Select Company'}
          </span>
          <span className="block truncate text-[length:var(--text-micro)] text-faint">
            {company ? modeLabel(company) : 'Solo with Claude'}
          </span>
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-faint" />
      </button>

      <div className="flex items-center gap-1">
        <CliStatus claudeBinary={claudeBinary} />

        {company ? (
          <button
            type="button"
            onClick={onSoloMode}
            title="Switch to solo Claude mode"
            className="rounded-[var(--radius-pill)] px-2.5 py-1 text-[length:var(--text-micro)] font-medium text-muted transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
          >
            Solo
          </button>
        ) : null}

        <button
          type="button"
          onClick={onOpenProviders}
          title="Providers & Keys"
          className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-line px-2.5 py-1 text-[length:var(--text-micro)] font-medium text-muted transition-colors duration-[var(--duration-fast)] hover:border-line-strong hover:bg-surface hover:text-ink"
        >
          <KeyRound aria-hidden className="size-3" />
          Keys
        </button>

        <button
          type="button"
          id="open-settings"
          onClick={onOpenSettings}
          title="Settings"
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint transition-colors duration-[var(--duration-fast)] hover:bg-surface hover:text-ink"
        >
          <Settings2 aria-hidden className="size-4" />
          <span className="sr-only">Settings</span>
        </button>
      </div>
    </footer>
  )
}

function CliStatus({
  claudeBinary
}: {
  readonly claudeBinary: string | null | undefined
}): React.JSX.Element {
  const label =
    claudeBinary === undefined
      ? 'Checking CLI'
      : claudeBinary === null
        ? 'CLI missing'
        : 'CLI ready'
  const tone = claudeBinary === null ? 'bg-danger' : claudeBinary ? 'bg-ok' : 'bg-faint'

  return (
    <p
      title={claudeBinary ?? undefined}
      className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-[length:var(--text-micro)] text-faint"
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone}`} />
      <span className="truncate">{label}</span>
    </p>
  )
}
