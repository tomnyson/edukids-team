import type { ClaudeGuiApi } from './index'

declare global {
  interface Window {
    api: ClaudeGuiApi
  }
}
