/**
 * App-wide confirm / alert / prompt — replaces browser dialogs with centered modals.
 * Register implementation from `<AppDialogProvider />` (see components/AppDialogProvider.tsx).
 */

export type AppDialogConfirmOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive action (e.g. delete) — primary button uses danger styling */
  danger?: boolean
}

export type AppDialogAlertOptions = {
  title?: string
  okLabel?: string
}

export type AppDialogPromptOptions = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type AppDialogImpl = {
  confirm: (message: string, options?: AppDialogConfirmOptions) => Promise<boolean>
  alert: (message: string, options?: AppDialogAlertOptions) => Promise<void>
  prompt: (message: string, defaultValue?: string, options?: AppDialogPromptOptions) => Promise<string | null>
}

let impl: AppDialogImpl | null = null

export function registerAppDialogImpl(next: AppDialogImpl | null) {
  impl = next
}

export function appConfirm(message: string, options?: AppDialogConfirmOptions): Promise<boolean> {
  if (impl) return impl.confirm(message, options)
  return Promise.resolve(window.confirm(message))
}

export function appAlert(message: string, options?: AppDialogAlertOptions): Promise<void> {
  if (impl) return impl.alert(message, options)
  window.alert(message)
  return Promise.resolve()
}

export function appPrompt(
  message: string,
  defaultValue = '',
  options?: AppDialogPromptOptions,
): Promise<string | null> {
  if (impl) return impl.prompt(message, defaultValue, options)
  const v = window.prompt(message, defaultValue)
  return Promise.resolve(v === null ? null : v)
}
