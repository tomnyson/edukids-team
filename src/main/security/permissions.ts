import { session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { permissionAllowed } from './permission-policy'

function devOrigin(): string | null {
  const url = is.dev ? process.env['ELECTRON_RENDERER_URL'] : undefined
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Replaces Electron's allow-everything default with the policy in permission-policy.ts. Both
 * handlers are needed: Chromium checks first and only requests when the check says no.
 */
export function installPermissionPolicy(): void {
  const origin = devOrigin()
  const ses = session.defaultSession

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(
      permissionAllowed(
        { permission, url: details.requestingUrl, mainFrame: details.isMainFrame, mediaTypes },
        origin
      )
    )
  })

  ses.setPermissionCheckHandler((_contents, permission, _requestingOrigin, details) =>
    permissionAllowed(
      {
        permission,
        url: details.requestingUrl ?? '',
        mainFrame: details.isMainFrame,
        mediaTypes: details.mediaType ? [details.mediaType] : []
      },
      origin
    )
  )
}
