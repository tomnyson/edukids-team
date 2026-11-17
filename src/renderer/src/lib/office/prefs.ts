/** How the user likes the office shown; kept in localStorage, so every field is re-checked on read. */

export const VIEWS = ['chat', 'office'] as const
export type ViewMode = (typeof VIEWS)[number]

export const LIGHTINGS = ['day', 'night'] as const
export type Lighting = (typeof LIGHTINGS)[number]

export interface OfficePrefs {
  readonly view: ViewMode
  readonly lighting: Lighting
  /** The status tags floating over each member. */
  readonly labels: boolean
  /** No shadows and a lower pixel ratio, for older machines and battery. */
  readonly lowPerformance: boolean
}

export const DEFAULT_OFFICE_PREFS: OfficePrefs = {
  view: 'chat',
  lighting: 'day',
  labels: true,
  lowPerformance: false
}

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  options.find((option) => option === value) ?? fallback

const flag = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // A hand-edited or truncated entry reads as "nothing saved"
    return null
  }
}

export function parseOfficePrefs(stored: string | null): OfficePrefs {
  const parsed = stored === null ? null : parseJson(stored)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_OFFICE_PREFS
  }
  const record = parsed as Record<string, unknown>
  return {
    view: oneOf(VIEWS, record.view, DEFAULT_OFFICE_PREFS.view),
    lighting: oneOf(LIGHTINGS, record.lighting, DEFAULT_OFFICE_PREFS.lighting),
    labels: flag(record.labels, DEFAULT_OFFICE_PREFS.labels),
    lowPerformance: flag(record.lowPerformance, DEFAULT_OFFICE_PREFS.lowPerformance)
  }
}
