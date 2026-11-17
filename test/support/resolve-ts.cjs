// Source files import siblings without an extension, as the bundler expects. Node's type
// stripping does not add `.ts` on its own, so retry relative specifiers with it.
const path = require('path')
const { pathToFileURL } = require('url')
const { registerHooks } = require('module')

// The `@shared/*` alias the bundler maps, so main-process modules load as they are
const SHARED = path.join(__dirname, '../../src/shared')

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@shared/')) {
      const file = path.join(SHARED, `${specifier.slice('@shared/'.length)}.ts`)
      return nextResolve(pathToFileURL(file).href, context)
    }
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (!specifier.startsWith('.') || path.extname(specifier) !== '') throw error
      return nextResolve(`${specifier}.ts`, context)
    }
  }
})
