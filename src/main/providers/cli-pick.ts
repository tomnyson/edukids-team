/**
 * First path the check accepts: the user's PATH matches in order, then the known install
 * spots, each tried once. A stale copy earlier on PATH (say, an npm shim that lost its native
 * binary) is skipped instead of being run every turn.
 */
export async function pickBinary(
  onPath: readonly string[],
  known: readonly string[],
  accepts: (path: string) => Promise<boolean>
): Promise<string | null> {
  const candidates = [...new Set([...onPath, ...known].map((path) => path.trim()).filter(Boolean))]
  for (const candidate of candidates) {
    if (await accepts(candidate)) return candidate
  }
  return null
}
