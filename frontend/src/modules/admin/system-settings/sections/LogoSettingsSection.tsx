import type { Dispatch, SetStateAction } from 'react'
import type { SystemSettingsPersistedV1 } from '@/core/types/systemSettings'

type LogoKey = 'logoLight' | 'logoDark' | 'logoIcon'

type Props = {
  draft: SystemSettingsPersistedV1
  setDraft: Dispatch<SetStateAction<SystemSettingsPersistedV1>>
  onLogoUpload: (which: LogoKey, file: File | undefined) => void | Promise<void>
}

const LOGO_SLOTS: { key: LogoKey; label: string; icon: string; emptyTitle: string; emptyHint: string }[] = [
  { key: 'logoIcon', label: 'App logo icon', icon: 'fa-solid fa-leaf', emptyTitle: 'Upload icon', emptyHint: 'Used in header logo icon area' },
  { key: 'logoLight', label: 'Light theme header', icon: 'fa-solid fa-cloud-arrow-up', emptyTitle: 'Upload logo', emptyHint: 'Click or tap to choose a file' },
  { key: 'logoDark', label: 'Dark theme header', icon: 'fa-solid fa-cloud-arrow-up', emptyTitle: 'Upload logo', emptyHint: 'Often a lighter mark on dark chrome' },
]

/** System Settings → Logos tab body. The three identical upload zones were folded into one slot renderer. */
export function LogoSettingsSection({ draft, setDraft, onLogoUpload }: Props) {
  return (
    <>
    <div className="sys-settings-panel__head">
      <h2 className="sys-settings-panel__title">
        <i className="fa-solid fa-images" aria-hidden />
        Logo management
      </h2>
      <p className="sys-settings-panel__desc">
        PNG or SVG recommended. Files are stored locally in your browser as Data URLs — ideal for branded headers.
      </p>
    </div>
      <div className="sys-logo-grid">
        {LOGO_SLOTS.map(slot => {
          const value = draft[slot.key]
          const inputId = `sys-logo-${slot.key}`
          return (
            <div key={slot.key}>
              <label className="sys-field-label" htmlFor={inputId}>{slot.label}</label>
              <label className="sys-logo-zone">
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  className="sys-logo-zone__input"
                  onChange={e => void onLogoUpload(slot.key, e.target.files?.[0])}
                />
                <span className="sys-logo-zone__inner">
                  {value ? (
                    <>
                      <img src={value} alt="" className="sys-logo-zone__preview" />
                      <span className="sys-logo-zone__hint">Click to replace</span>
                    </>
                  ) : (
                    <>
                      <div className="sys-logo-zone__icon">
                        <i className={slot.icon} />
                      </div>
                      <div className="sys-logo-zone__title">{slot.emptyTitle}</div>
                      <div className="sys-logo-zone__hint">{slot.emptyHint}</div>
                    </>
                  )}
                </span>
              </label>
              <div className="sys-logo-zone__actions">
                <button type="button" className="gis-btn gis-btn-outline" onClick={() => setDraft(d => ({ ...d, [slot.key]: '' }))}>
                  Clear
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
