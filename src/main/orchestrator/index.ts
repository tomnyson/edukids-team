import type { OrchestrationOptions } from './roundtable'
import { runRoundtable } from './roundtable'
import { runPipeline } from './pipeline'

export async function runCompanyOrchestration(options: OrchestrationOptions): Promise<void> {
  const mode = options.company.defaultMode ?? 'roundtable'
  if (mode === 'pipeline') {
    return runPipeline(options)
  }
  return runRoundtable(options)
}

export { runRoundtable, runPipeline }
export type { OrchestrationOptions }
