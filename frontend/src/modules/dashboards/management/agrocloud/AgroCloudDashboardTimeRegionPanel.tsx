import { useState, type Dispatch, SetStateAction } from 'react'
import type { AgroCloudDashboardConfig } from './agroCloudDashboardData'
import {
  AGROCLOUD_TIME_ZONE_OPTIONS,
  AGROCLOUD_UNIT_PREFIX_DEFINITIONS,
  AGROCLOUD_UNIT_PREFIX_FORMAT_OPTIONS,
  buildDefaultUnitPrefixes,
  defaultTimeRegionConfigPatch,
  type AgroCloudUnitPrefixFormat,
  type AgroCloudUnitPrefixId,
  unitPrefixesForFormat,
} from './agroCloudDashboardTimeRegion'

type Props = {
  config: AgroCloudDashboardConfig
  onConfigChange: Dispatch<SetStateAction<AgroCloudDashboardConfig>>
}

type SectionId = 'timeZone' | 'unitPrefixes'

export function AgroCloudDashboardTimeRegionPanel({ config, onConfigChange }: Props) {
  const [openSection, setOpenSection] = useState<SectionId>('timeZone')
  const unitPrefixFormat = config.unitPrefixFormat ?? 'custom'
  const unitPrefixes =
    unitPrefixFormat === 'custom'
      ? { ...buildDefaultUnitPrefixes(), ...(config.unitPrefixes ?? {}) }
      : unitPrefixesForFormat(unitPrefixFormat)

  const toggleSection = (id: SectionId) => setOpenSection(prev => (prev === id ? prev : id))

  const setFormat = (format: AgroCloudUnitPrefixFormat) => {
    onConfigChange(prev => ({
      ...prev,
      unitPrefixFormat: format,
      unitPrefixes: unitPrefixesForFormat(format),
    }))
  }

  const patchPrefix = (id: AgroCloudUnitPrefixId, patch: { enabled?: boolean; symbol?: string }) => {
    onConfigChange(prev => ({
      ...prev,
      unitPrefixFormat: 'custom',
      unitPrefixes: {
        ...(prev.unitPrefixes ?? unitPrefixesForFormat(prev.unitPrefixFormat ?? 'international')),
        [id]: {
          ...(prev.unitPrefixes?.[id] ?? unitPrefixesForFormat(prev.unitPrefixFormat ?? 'international')[id]),
          ...patch,
        },
      },
    }))
  }

  const reset = () => {
    onConfigChange(prev => ({ ...prev, ...defaultTimeRegionConfigPatch() }))
  }

  return (
    <>
      <div className="agrocloud-dashboard-editor__accordion agrocloud-dashboard-editor__time-region">
        <div className={`agrocloud-dashboard-editor__accordion-section${openSection === 'timeZone' ? ' is-open' : ''}`}>
          <button
            type="button"
            className="agrocloud-dashboard-editor__accordion-head"
            aria-expanded={openSection === 'timeZone'}
            onClick={() => toggleSection('timeZone')}
          >
            <span>Time zone</span>
            <span className="agrocloud-dashboard-editor__accordion-icons">
              <i className={`fa-solid fa-chevron-${openSection === 'timeZone' ? 'up' : 'down'}`} aria-hidden />
              <i
                className="fa-solid fa-circle-info"
                aria-hidden
                title="Select how time values are displayed across maps, widgets, reports, and data visualizations."
              />
            </span>
          </button>
          {openSection === 'timeZone' ? (
            <div className="agrocloud-dashboard-editor__accordion-body agrocloud-dashboard-editor__accordion-body--time">
              <div className="agrocloud-dashboard-editor__time-region-field">
                <label className="agrocloud-dashboard-editor__radio">
                  <input
                    type="radio"
                    name="dashboard-tz"
                    checked={config.timeZone === 'device'}
                    onChange={() => onConfigChange(prev => ({ ...prev, timeZone: 'device' }))}
                  />
                  <span>Device time zone</span>
                </label>
                <p className="agrocloud-dashboard-editor__field-hint">
                  Automatically uses the time zone configured on the user&apos;s device.
                </p>
              </div>
              <div className="agrocloud-dashboard-editor__time-region-field">
                <label className="agrocloud-dashboard-editor__radio">
                  <input
                    type="radio"
                    name="dashboard-tz"
                    checked={config.timeZone === 'specific'}
                    onChange={() => onConfigChange(prev => ({ ...prev, timeZone: 'specific' }))}
                  />
                  <span>Specific time zone</span>
                </label>
                <p className="agrocloud-dashboard-editor__field-hint">
                  Use a fixed time zone for all users, ensuring consistent time display regardless of location.
                </p>
                {config.timeZone === 'specific' ? (
                  <select
                    className="agrocloud-dashboard-editor__select agrocloud-dashboard-editor__select--time-zone"
                    value={config.specificTimeZone ?? 'Etc/UTC'}
                    onChange={e => onConfigChange(prev => ({ ...prev, specificTimeZone: e.target.value }))}
                    aria-label="Specific time zone"
                  >
                    {AGROCLOUD_TIME_ZONE_OPTIONS.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className={`agrocloud-dashboard-editor__accordion-section${openSection === 'unitPrefixes' ? ' is-open' : ''}`}>
          <button
            type="button"
            className="agrocloud-dashboard-editor__accordion-head"
            aria-expanded={openSection === 'unitPrefixes'}
            onClick={() => toggleSection('unitPrefixes')}
          >
            <span>Unit prefixes</span>
            <i className={`fa-solid fa-chevron-${openSection === 'unitPrefixes' ? 'up' : 'down'}`} aria-hidden />
          </button>
          {openSection === 'unitPrefixes' ? (
            <div className="agrocloud-dashboard-editor__accordion-body agrocloud-dashboard-editor__accordion-body--prefixes">
              <p className="agrocloud-dashboard-editor__field-hint agrocloud-dashboard-editor__field-hint--block">
                Define how large numeric values are abbreviated in charts, indicators, tables, and statistics.
              </p>
              <label className="agrocloud-dashboard-editor__field-label">Display format</label>
              <select
                className="agrocloud-dashboard-editor__select"
                value={unitPrefixFormat}
                onChange={e => setFormat(e.target.value as AgroCloudUnitPrefixFormat)}
                aria-label="Unit prefix display format"
              >
                {AGROCLOUD_UNIT_PREFIX_FORMAT_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ul className="agrocloud-dashboard-editor__unit-prefix-list">
                {AGROCLOUD_UNIT_PREFIX_DEFINITIONS.map(def => {
                  const row = unitPrefixes[def.id] ?? { enabled: def.defaultEnabled, symbol: def.defaultSymbol }
                  const symbolDisabled = unitPrefixFormat === 'full' || !row.enabled
                  return (
                    <li key={def.id} className="agrocloud-dashboard-editor__unit-prefix-row">
                      <span className="agrocloud-dashboard-editor__unit-prefix-label" title={def.label}>
                        {def.label}
                      </span>
                      <label className="agrocloud-dashboard-editor__toggle">
                        <input
                          type="checkbox"
                          checked={row.enabled}
                          disabled={unitPrefixFormat === 'full'}
                          onChange={e => patchPrefix(def.id, { enabled: e.target.checked })}
                          aria-label={`Enable ${def.label}`}
                        />
                        <span className="agrocloud-dashboard-editor__toggle-track" aria-hidden />
                      </label>
                      {row.enabled ? (
                        <input
                          type="text"
                          className="agrocloud-dashboard-editor__unit-prefix-symbol"
                          value={row.symbol}
                          maxLength={3}
                          disabled={symbolDisabled}
                          onChange={e => patchPrefix(def.id, { symbol: e.target.value })}
                          aria-label={`${def.label} symbol`}
                        />
                      ) : (
                        <span className="agrocloud-dashboard-editor__unit-prefix-symbol-spacer" aria-hidden />
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <div className="agrocloud-dashboard-editor__time-region-footer">
        <button type="button" className="agrocloud-dashboard-editor__time-region-reset" onClick={reset}>
          Reset
        </button>
      </div>
    </>
  )
}
