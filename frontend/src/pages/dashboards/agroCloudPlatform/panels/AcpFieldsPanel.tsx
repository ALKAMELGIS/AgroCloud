import { useEffect, useMemo, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { AcpCountryOption, AcpFieldTableRow } from '../acpMapSpatial'
import { useAcpPlatform } from '../acpPlatformContext'
import { resolveAcpFieldHvdColor } from '../../../../lib/siCropAlertDchasBeacon'
import { CropAlertTierIcon } from '../../../satellite/components/SiCropAlertHvdIcon'
import { useAcpVirtualRows } from '../hooks/useAcpVirtualRows'
import { useBreakpoint } from '../hooks/useBreakpoint'
import '../../../satellite/components/SiCropAlertHvdIcon.css'

type Props = {
  rows: AcpFieldTableRow[]
  countries: AcpCountryOption[]
  viewportScopeActive?: boolean
  drawerMode?: boolean
  onDrawerClose?: () => void
}

type FieldsViewMode = 'table' | 'list'
type FieldsRowDensity = 1 | 2

const ALERT_RANK: Record<string, number> = {
  critical: 0,
  stress: 1,
  warning: 2,
  watch: 3,
  stable: 4,
  healthy: 5,
}

const TABLE_ROW_HEIGHT: Record<FieldsRowDensity, number> = {
  1: 24,
  2: 18,
}

function isAlertFieldRow(row: AcpFieldTableRow): boolean {
  return row.alertTier !== 'stable' || row.severity !== 'normal'
}

function alertIcon(row: AcpFieldTableRow) {
  return (
    <CropAlertTierIcon
      tier={row.alertTier}
      size="sm"
      className="acp-fields__alert-hvd"
      title={row.status}
      color={resolveAcpFieldHvdColor(row)}
    />
  )
}

function coverageTrendTitle(row: AcpFieldTableRow): string {
  if (row.coverageTrendDelta != null && Number.isFinite(row.coverageTrendDelta)) {
    const sign = row.coverageTrendDelta >= 0 ? '+' : ''
    return `ΔCHAS ${sign}${row.coverageTrendDelta.toFixed(3)} vs previous Alert scene`
  }
  if (row.coverageTrend === 'up') return 'NDVI coverage rising vs previous scene'
  if (row.coverageTrend === 'down') return 'NDVI coverage declining vs previous scene'
  if (row.coverageTrend === 'flat') return 'NDVI coverage stable vs previous scene'
  return 'Coverage trend unavailable'
}

function CoveragePctCell({ row }: { row: AcpFieldTableRow }) {
  if (row.coveragePct == null) return <>—</>
  const trend = row.coverageTrend
  return (
    <span className="acp-fields__coverage" title={coverageTrendTitle(row)}>
      <span>{row.coveragePct.toFixed(0)}%</span>
      {trend === 'up' ? (
        <i
          className="fa-solid fa-arrow-up acp-fields__coverage-trend acp-fields__coverage-trend--up"
          aria-hidden
        />
      ) : null}
      {trend === 'down' ? (
        <i
          className="fa-solid fa-arrow-down acp-fields__coverage-trend acp-fields__coverage-trend--down"
          aria-hidden
        />
      ) : null}
      {trend === 'flat' ? (
        <i
          className="fa-solid fa-minus acp-fields__coverage-trend acp-fields__coverage-trend--flat"
          aria-hidden
        />
      ) : null}
    </span>
  )
}

function exportFieldsPdf(rows: AcpFieldTableRow[]) {
  const stamp = new Date().toISOString().slice(0, 10)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  doc.setFontSize(11)
  doc.text('AgroCloud Platform — Interactive Fields', 40, 36)
  doc.setFontSize(8)
  doc.text(`${rows.length} fields · ${stamp}`, 40, 52)
  autoTable(doc, {
    head: [['Field', 'CHAS', 'Area (Ha)', 'Coverage %', 'Status', 'Country']],
    body: rows.map(r => [
      r.displayName,
      r.chas != null ? r.chas.toFixed(3) : '—',
      r.areaHa.toFixed(2),
      r.coveragePct != null ? `${r.coveragePct.toFixed(0)}%` : '—',
      r.status,
      r.country,
    ]),
    startY: 64,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [34, 139, 34], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  })
  doc.save(`acp-fields-${stamp}.pdf`)
}

export function AcpFieldsPanel({
  rows,
  countries,
  viewportScopeActive = false,
  drawerMode = false,
  onDrawerClose,
}: Props) {
  const acp = useAcpPlatform()
  const bp = useBreakpoint()
  const viewModeUserOverride = useRef(false)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [alertsOnly, setAlertsOnly] = useState(false)
  const [viewMode, setViewMode] = useState<FieldsViewMode>(() => acp.config.fieldsPanel.defaultViewMode)
  const [rowDensity, setRowDensity] = useState<FieldsRowDensity>(() => acp.config.fieldsPanel.defaultRowDensity)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const tableWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (viewModeUserOverride.current) return
    if (bp === 'mobile') setViewMode('list')
    else setViewMode(acp.config.fieldsPanel.defaultViewMode)
  }, [bp, acp.config.fieldsPanel.defaultViewMode])

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = q
      ? rows.filter(
          r =>
            r.displayName.toLowerCase().includes(q) ||
            r.country.toLowerCase().includes(q) ||
            r.status.toLowerCase().includes(q),
        )
      : [...rows]
    if (alertsOnly) {
      list = list.filter(isAlertFieldRow)
    }
    list.sort((a, b) => {
      const ra = ALERT_RANK[a.alertTier] ?? 9
      const rb = ALERT_RANK[b.alertTier] ?? 9
      return sortDir === 'asc' ? ra - rb : rb - ra
    })
    return list
  }, [rows, query, alertsOnly, sortDir])

  const rowHeight = TABLE_ROW_HEIGHT[rowDensity]
  const virtual = useAcpVirtualRows(visibleRows, tableWrapRef, rowHeight)

  const selectField = (fieldKey: string) => {
    acp.bindMapFieldSelection(fieldKey)
  }

  const locateField = (fieldKey: string) => {
    acp.requestFieldLocate(fieldKey)
  }

  return (
    <aside className="acp-panel acp-fields">
      <div className="acp-panel__head acp-fields__head">
        <label className="acp-fields__country">
          <span className="acp-panel__label">
            <i className="fa-solid fa-globe" aria-hidden /> Countries
          </span>
          <select
            value={acp.countryFilter}
            onChange={e => acp.selectPortfolioCountry(e.target.value)}
          >
            {countries.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="acp-fields__list-head">
          <span className="acp-panel__title">
            Interactive Fields List
            {viewportScopeActive ? (
              <span className="acp-fields__scope-hint"> · {rows.length} in map view</span>
            ) : null}
          </span>
          <div className="acp-fields__toolbar">
            <button
              type="button"
              className={`acp-fields__tool${searchOpen ? ' is-on' : ''}`}
              title="Search"
              aria-pressed={searchOpen}
              onClick={() => setSearchOpen(v => !v)}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden />
            </button>
            <button
              type="button"
              className={`acp-fields__tool${alertsOnly ? ' is-on' : ''}`}
              title={alertsOnly ? 'Show all fields' : 'Alerts only'}
              aria-pressed={alertsOnly}
              onClick={() => setAlertsOnly(v => !v)}
            >
              <i className="fa-solid fa-bell" aria-hidden />
            </button>
            <button
              type="button"
              className={`acp-fields__tool${viewMode === 'list' ? ' is-on' : ''}`}
              title={viewMode === 'list' ? 'Table view' : 'List view'}
              aria-pressed={viewMode === 'list'}
              onClick={() => {
                viewModeUserOverride.current = true
                setViewMode(v => (v === 'table' ? 'list' : 'table'))
              }}
            >
              <i className="fa-solid fa-list" aria-hidden />
            </button>
            <button
              type="button"
              className={`acp-fields__tool acp-fields__tool--text${rowDensity === 2 ? ' is-on' : ''}`}
              title={rowDensity === 1 ? 'Compact density (2×)' : 'Comfortable density (1×)'}
              aria-pressed={rowDensity === 2}
              onClick={() => setRowDensity(d => (d === 1 ? 2 : 1))}
            >
              {rowDensity}×
            </button>
            <button
              type="button"
              className="acp-fields__tool"
              title="Export PDF"
              onClick={() => exportFieldsPdf(visibleRows)}
            >
              <i className="fa-solid fa-file-pdf" aria-hidden />
            </button>
            {drawerMode && onDrawerClose ? (
              <button
                type="button"
                className="acp-panel__drawer-close"
                aria-label="Close fields panel"
                onClick={onDrawerClose}
              >
                <i className="fa-solid fa-xmark" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        {searchOpen ? (
          <input
            type="search"
            className="acp-fields__search"
            placeholder="Filter fields…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        ) : null}
      </div>
      <div
        ref={tableWrapRef}
        className={`acp-fields__table-wrap${rowDensity === 2 ? ' acp-fields--density-2' : ''}`}
      >
        {viewMode === 'list' ? (
          <ul className="acp-fields__list" aria-label="Fields list">
            {visibleRows.map(row => (
              <li
                key={row.fieldKey}
                className={`acp-fields__list-item${acp.selectedFieldKey === row.fieldKey ? ' is-selected' : ''}`}
                onClick={() => selectField(row.fieldKey)}
              >
                {alertIcon(row)}
                <span className="acp-fields__list-name">{row.displayName}</span>
                <span className="acp-fields__list-meta">
                  {row.chas != null ? row.chas.toFixed(2) : '—'} · {row.areaHa.toFixed(1)} ha
                </span>
                <button
                  type="button"
                  className="acp-fields__locate"
                  aria-label={`Locate ${row.displayName}`}
                  onClick={e => {
                    e.stopPropagation()
                    locateField(row.fieldKey)
                  }}
                >
                  <i className="fa-solid fa-crosshairs" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <table className="acp-fields__table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="acp-fields__sort" onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}>
                    Alert
                    <i className={`fa-solid fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} aria-hidden />
                  </button>
                </th>
                <th>Field</th>
                <th>CHAS</th>
                <th>Area (Ha)</th>
                <th>Coverage %</th>
                <th aria-label="Locate" />
              </tr>
            </thead>
            <tbody>
              {virtual.paddingTop > 0 ? (
                <tr className="acp-fields__spacer" aria-hidden>
                  <td colSpan={6} style={{ height: virtual.paddingTop, padding: 0, border: 0 }} />
                </tr>
              ) : null}
              {virtual.visibleItems.map(({ item: row }) => (
                <tr
                  key={row.fieldKey}
                  className={acp.selectedFieldKey === row.fieldKey ? 'is-selected' : ''}
                  onClick={() => selectField(row.fieldKey)}
                >
                  <td>{alertIcon(row)}</td>
                  <td className="acp-fields__name">{row.displayName}</td>
                  <td className="acp-fields__num">{row.chas != null ? row.chas.toFixed(3) : '—'}</td>
                  <td className="acp-fields__num">{row.areaHa.toFixed(2)}</td>
                  <td className="acp-fields__num">
                    <CoveragePctCell row={row} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="acp-fields__locate"
                      aria-label={`Locate ${row.displayName}`}
                      onClick={e => {
                        e.stopPropagation()
                        locateField(row.fieldKey)
                      }}
                    >
                      <i className="fa-solid fa-crosshairs" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
              {virtual.paddingBottom > 0 ? (
                <tr className="acp-fields__spacer" aria-hidden>
                  <td colSpan={6} style={{ height: virtual.paddingBottom, padding: 0, border: 0 }} />
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
        {!visibleRows.length ? <p className="acp-empty">No fields in map scope.</p> : null}
      </div>
    </aside>
  )
}
