import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  registerAppDialogImpl,
  type AppDialogAlertOptions,
  type AppDialogConfirmOptions,
  type AppDialogImpl,
  type AppDialogPromptOptions,
} from '../lib/appDialog'
import './app-dialog.css'

type DialogState =
  | {
      kind: 'confirm'
      title: string
      message: string
      confirmLabel: string
      cancelLabel: string
      danger: boolean
      complete: (v: boolean) => void
    }
  | {
      kind: 'alert'
      title: string
      message: string
      okLabel: string
      complete: () => void
    }
  | {
      kind: 'prompt'
      title: string
      message: string
      defaultValue: string
      confirmLabel: string
      cancelLabel: string
      complete: (v: string | null) => void
    }

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const openRef = useRef(false)
  const promptInputRef = useRef<HTMLInputElement | null>(null)

  const endDialog = useCallback(() => {
    openRef.current = false
    setDialog(null)
  }, [])

  const confirmImpl = useCallback((message: string, options?: AppDialogConfirmOptions) => {
    return new Promise<boolean>(promiseResolve => {
      if (openRef.current) {
        promiseResolve(window.confirm(message))
        return
      }
      openRef.current = true
      setDialog({
        kind: 'confirm',
        message,
        title: options?.title?.trim() || 'Confirm',
        confirmLabel: options?.confirmLabel?.trim() || 'OK',
        cancelLabel: options?.cancelLabel?.trim() || 'Cancel',
        danger: options?.danger === true,
        complete: (v: boolean) => {
          promiseResolve(v)
          endDialog()
        },
      })
    })
  }, [endDialog])

  const alertImpl = useCallback((message: string, options?: AppDialogAlertOptions) => {
    return new Promise<void>(promiseResolve => {
      if (openRef.current) {
        window.alert(message)
        promiseResolve()
        return
      }
      openRef.current = true
      setDialog({
        kind: 'alert',
        message,
        title: options?.title?.trim() || 'Notice',
        okLabel: options?.okLabel?.trim() || 'OK',
        complete: () => {
          promiseResolve()
          endDialog()
        },
      })
    })
  }, [endDialog])

  const promptImpl = useCallback(
    (message: string, defaultValue = '', options?: AppDialogPromptOptions) => {
      return new Promise<string | null>(promiseResolve => {
        if (openRef.current) {
          promiseResolve(window.prompt(message, defaultValue))
          return
        }
        openRef.current = true
        setDialog({
          kind: 'prompt',
          message,
          defaultValue: defaultValue ?? '',
          title: options?.title?.trim() || 'Input',
          confirmLabel: options?.confirmLabel?.trim() || 'OK',
          cancelLabel: options?.cancelLabel?.trim() || 'Cancel',
          complete: (v: string | null) => {
            promiseResolve(v)
            endDialog()
          },
        })
      })
    },
    [endDialog],
  )

  useEffect(() => {
    const impl: AppDialogImpl = {
      confirm: confirmImpl,
      alert: alertImpl,
      prompt: promptImpl,
    }
    registerAppDialogImpl(impl)
    return () => registerAppDialogImpl(null)
  }, [confirmImpl, alertImpl, promptImpl])

  useEffect(() => {
    if (!dialog || dialog.kind !== 'prompt') return
    const t = window.setTimeout(() => {
      promptInputRef.current?.focus()
      promptInputRef.current?.select()
    }, 60)
    return () => window.clearTimeout(t)
  }, [dialog])

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (dialog.kind === 'confirm') dialog.complete(false)
      else if (dialog.kind === 'alert') dialog.complete()
      else dialog.complete(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  const onOverlayPointerDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return
    if (!dialog) return
    if (dialog.kind === 'confirm') dialog.complete(false)
    else if (dialog.kind === 'alert') dialog.complete()
    else dialog.complete(null)
  }

  return (
    <>
      {children}
      {dialog ? (
        <div
          className="ds-modal-overlay app-dialog-overlay"
          role="presentation"
          onMouseDown={onOverlayPointerDown}
        >
          <div
            className="ds-modal app-dialog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="ds-modal-header">
              <span id="app-dialog-title" className="ds-modal-title app-dialog-title">
                {dialog.title}
              </span>
            </div>
            <div className="ds-modal-body">
              <p className="app-dialog-message">{dialog.message}</p>
              {dialog.kind === 'prompt' ? (
                <input
                  ref={promptInputRef}
                  type="text"
                  className="ds-input app-dialog-input"
                  defaultValue={dialog.defaultValue}
                  aria-label={dialog.message}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const v = (e.currentTarget as HTMLInputElement).value
                      dialog.complete(v)
                    }
                  }}
                />
              ) : null}
            </div>
            <div className="ds-modal-actions app-dialog-actions">
              {dialog.kind === 'confirm' ? (
                <>
                  <button type="button" className="app-dialog-btn" onClick={() => dialog.complete(false)}>
                    {dialog.cancelLabel}
                  </button>
                  <button
                    type="button"
                    className={
                      dialog.danger ? 'app-dialog-btn app-dialog-btn--danger' : 'app-dialog-btn app-dialog-btn--primary'
                    }
                    onClick={() => dialog.complete(true)}
                  >
                    {dialog.confirmLabel}
                  </button>
                </>
              ) : dialog.kind === 'alert' ? (
                <button type="button" className="app-dialog-btn app-dialog-btn--primary" onClick={() => dialog.complete()}>
                  {dialog.okLabel}
                </button>
              ) : (
                <>
                  <button type="button" className="app-dialog-btn" onClick={() => dialog.complete(null)}>
                    {dialog.cancelLabel}
                  </button>
                  <button
                    type="button"
                    className="app-dialog-btn app-dialog-btn--primary"
                    onClick={() => {
                      const el = promptInputRef.current
                      dialog.complete(el ? el.value : null)
                    }}
                  >
                    {dialog.confirmLabel}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
