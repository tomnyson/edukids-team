import type { AppError, Result } from '@shared/types'

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const fail = (error: AppError): Result<never> => ({ ok: false, error })

/** Turns any thrown value into an error envelope so the renderer never sees a raw throw. */
export function guard<A extends unknown[], T>(
  scope: string,
  handler: (...args: A) => Promise<Result<T>> | Result<T>
): (...args: A) => Promise<Result<T>> {
  return async (...args: A) => {
    try {
      return await handler(...args)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error(`[ipc:${scope}] handler failed:`, detail)
      return fail({ code: 'UNKNOWN', message: 'Something went wrong inside the app.', detail })
    }
  }
}
