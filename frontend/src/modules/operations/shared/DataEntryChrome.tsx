import type { ReactNode } from 'react'
import './data-entry-chrome.css'

/**
 * Shared chrome for the daily data-entry workflow pages (EC / pH, Irrigation, Harvest,
 * Production, QHIS). Presentation only — every handler, label and aria name is supplied
 * by the page so behaviour (and the tests that query by role/name) is unchanged.
 */

export type EntryFlashState = { kind: 'success' | 'error'; message: string } | null

/** Transient submit / save feedback. Polite live region so screen readers announce it. */
export function EntryFlash({ flash, className }: { flash: EntryFlashState; className?: string }) {
  if (!flash) return null
  const ok = flash.kind === 'success'
  return (
    <div
      className={`entry-flash entry-flash--${ok ? 'success' : 'error'}${className ? ` ${className}` : ''}`}
      role={ok ? 'status' : 'alert'}
      aria-live={ok ? 'polite' : 'assertive'}
    >
      <i className={ok ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'} aria-hidden="true" />
      <span>{flash.message}</span>
    </div>
  )
}

/** List of validation problems shown directly under the form, before the action bar. */
export function EntryValidationAlert({ messages, title = 'Validation issues' }: { messages: string[]; title?: string }) {
  if (!messages.length) return null
  return (
    <div className="entry-validation" role="alert" aria-live="assertive">
      <h3 className="entry-validation__title">
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {title}
      </h3>
      <ul className="entry-validation__list">
        {messages.slice(0, 50).map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  )
}

/** Card header for the data-entry form: title, configuration hint and (managers) settings gear. */
export function EntryFormCardHeader({
  title,
  subtitle = 'Configured in Settings (Manager and Admin only)',
  settingsAriaLabel,
  onOpenSettings,
  settingsBusy,
  actions,
}: {
  title: string
  subtitle?: string
  settingsAriaLabel?: string
  onOpenSettings?: () => void
  settingsBusy?: boolean
  actions?: ReactNode
}) {
  return (
    <div className="ec-card-header entry-card-header">
      <div className="entry-card-header__lead">
        <div className="ec-card-title">
          <i className="fa-solid fa-circle-info entry-card-header__icon" aria-hidden="true"></i>
          {title}
        </div>
        {subtitle ? <div className="ec-card-subtitle-small">{subtitle}</div> : null}
      </div>
      {onOpenSettings || actions ? (
        <div className="ec-card-header-actions">
          {actions}
          {onOpenSettings ? (
            <button
              type="button"
              className="ec-icon-btn"
              aria-label={settingsAriaLabel ?? 'Open workflow settings'}
              title="Settings"
              disabled={settingsBusy}
              onClick={onOpenSettings}
            >
              <i className={settingsBusy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-gear'} aria-hidden="true"></i>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export type EntryBusy = null | 'saveAdd' | 'submit'

/**
 * Primary action row. Quiet utilities (Quick Fill, Clear) on the start side; the commit
 * actions on the end side with "Submit Entry" as the single filled primary. Sticky to the
 * bottom of the viewport on phones so the commit buttons are always one thumb-tap away.
 */
export function EntryActionBar({
  busy,
  onQuickFill,
  onClear,
  onSaveAddAnother,
  onSubmit,
  onNext,
}: {
  busy: EntryBusy
  onQuickFill: () => void
  onClear: () => void
  onSaveAddAnother: () => void
  onSubmit: () => void
  onNext: () => void
}) {
  const isBusy = Boolean(busy)
  return (
    <div className="entry-actions" role="group" aria-label="Entry actions">
      <div className="entry-actions__group entry-actions__group--utility">
        <button type="button" className="ec-btn entry-btn entry-btn--quiet" onClick={onQuickFill} disabled={isBusy} aria-label="Quick Fill" title="Quick Fill">
          <i className="fa-solid fa-bolt" aria-hidden="true" /> Quick Fill
        </button>
        <button type="button" className="ec-btn ec-btn-ghost entry-btn entry-btn--quiet" onClick={onClear} disabled={isBusy} aria-label="Clear" title="Clear">
          <i className="fa-solid fa-eraser" aria-hidden="true" /> Clear
        </button>
        <span className="entry-actions__hint" aria-hidden="true">
          <kbd>Ctrl</kbd>+<kbd>S</kbd> save &amp; next
        </span>
      </div>
      <div className="entry-actions__group entry-actions__group--commit">
        <button type="button" className="ec-btn entry-btn entry-btn--link" onClick={onNext} disabled={isBusy} aria-label="Recipes" title="Recipes">
          Next <i className="fa-solid fa-arrow-right entry-btn__dir-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ec-btn ec-btn-secondary entry-btn entry-btn--secondary"
          onClick={onSaveAddAnother}
          disabled={isBusy}
          aria-label="Save and add another"
          title="Ctrl+S"
        >
          <i className={busy === 'saveAdd' ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-plus'} aria-hidden="true" /> Save &amp; Add Another
        </button>
        <button
          type="button"
          className="ec-btn ec-btn-primary entry-btn entry-btn--primary"
          onClick={onSubmit}
          disabled={isBusy}
          aria-label="Submit entry"
          title="Submit Entry"
          aria-busy={busy === 'submit' || undefined}
        >
          <i className={busy === 'submit' ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-check'} aria-hidden="true" /> Submit Entry
        </button>
      </div>
    </div>
  )
}
