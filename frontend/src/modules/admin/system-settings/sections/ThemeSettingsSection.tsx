import type { Dispatch, SetStateAction } from 'react'
import type { SystemSettingsPersistedV1 } from '@/core/types/systemSettings'

type Props = {
  draft: SystemSettingsPersistedV1
  setDraft: Dispatch<SetStateAction<SystemSettingsPersistedV1>>
}

/** System Settings → Theme tab body (mode picker + custom brand color). Extracted verbatim from SystemSettings.tsx. */
export function ThemeSettingsSection({ draft, setDraft }: Props) {
  return (
    <>
      <div className="sys-settings-panel__head">
        <h2 className="sys-settings-panel__title">
          <i className="fa-solid fa-brush" aria-hidden />
          Appearance
        </h2>
        <p className="sys-settings-panel__desc">
          Choose a base theme. Custom applies your brand color across buttons and accents while keeping a light shell.
        </p>
      </div>

      <span className="sys-field-label">Mode</span>
      <div className="sys-theme-picks" role="radiogroup" aria-label="Theme mode">
        <button
          type="button"
          role="radio"
          aria-checked={draft.themeMode === 'system'}
          className={`sys-theme-pick ${draft.themeMode === 'system' ? 'sys-theme-pick--active' : ''}`}
          onClick={() => setDraft(d => ({ ...d, themeMode: 'system' }))}
        >
          <span className="sys-theme-pick__icon">
            <i className="fa-solid fa-desktop" />
          </span>
          System
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={draft.themeMode === 'light'}
          className={`sys-theme-pick ${draft.themeMode === 'light' ? 'sys-theme-pick--active' : ''}`}
          onClick={() => setDraft(d => ({ ...d, themeMode: 'light' }))}
        >
          <span className="sys-theme-pick__icon">
            <i className="fa-solid fa-sun" />
          </span>
          Light
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={draft.themeMode === 'dark'}
          className={`sys-theme-pick ${draft.themeMode === 'dark' ? 'sys-theme-pick--active' : ''}`}
          onClick={() => setDraft(d => ({ ...d, themeMode: 'dark' }))}
        >
          <span className="sys-theme-pick__icon">
            <i className="fa-solid fa-moon" />
          </span>
          Dark
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={draft.themeMode === 'custom'}
          className={`sys-theme-pick ${draft.themeMode === 'custom' ? 'sys-theme-pick--active' : ''}`}
          onClick={() => setDraft(d => ({ ...d, themeMode: 'custom' }))}
        >
          <span className="sys-theme-pick__icon">
            <i className="fa-solid fa-droplet" />
          </span>
          Custom
        </button>
      </div>

      {draft.themeMode === 'custom' ? (
        <div className="sys-color-editor">
          <span className="sys-field-label">Primary brand color</span>
          <div className="sys-color-row">
            <div className="sys-color-swatch" title="Pick color">
              <input
                type="color"
                value={draft.customPrimaryHex.match(/^#[0-9A-Fa-f]{6}$/) ? draft.customPrimaryHex : '#047857'}
                onChange={e => setDraft(d => ({ ...d, customPrimaryHex: e.target.value }))}
                aria-label="Pick primary color"
              />
            </div>
            <div className="sys-color-hex">
              <label htmlFor="sys-theme-hex" className="sys-field-label">
                Hex value
              </label>
              <input
                id="sys-theme-hex"
                className="gis-input"
                value={draft.customPrimaryHex}
                onChange={e => setDraft(d => ({ ...d, customPrimaryHex: e.target.value }))}
                placeholder="#047857"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
