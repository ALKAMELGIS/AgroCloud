import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
} from 'chart.js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import * as XLSX from 'xlsx'
import type {
  GeoExplorerDataTableColumn,
  GeoExplorerDataTablePayload,
  GeoExplorerDataTableRow,
  GeoExplorerMapLink,
} from '../../../lib/geoExplorerGemini'
import { stableFeatureLinkKey } from '../../../lib/geoAiLinkedSelection'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export type GeoExplorerMapAction = 'zoom' | 'highlight' | 'focus' | 'openTable'

export type GeoExplorerDynamicTableProps = {
  cssPrefix: string
  table: GeoExplorerDataTablePayload
  onMapAction?: (action: GeoExplorerMapAction, link: GeoExplorerMapLink) => void
  /** Fit map to combined extent of linked features (multi-select). */
  onBatchZoom?: (links: GeoExplorerMapLink[]) => void
  /** Stable id for this table instance (e.g. messageId + table index) — drives merged map highlight. */
  tableSyncId?: string
  /** Emits whenever checkbox selection changes so the map can highlight linked features in real time. */
  onSelectionLinksChange?: (tableId: string, links: GeoExplorerMapLink[]) => void
  /** `layerId::featureKey` from map identify — scrolls/highlights the matching row. */
  mapFocusFeatureKey?: string | null
  /** Called after applying a FIELD IN (...) query selection (parent may briefly suppress identify popups). */
  onQuerySelectApplied?: () => void
}

const PAGE_OPTS = [10, 25, 50, 100] as const

function cellStr(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v)
}

function stableRowKey(row: GeoExplorerDataTableRow): string {
  const ml = row.mapLink
  if (ml?.type === 'feature') return `f:${ml.layerId}:${ml.featureKey}`
  if (ml?.type === 'coords') return `c:${ml.lng},${ml.lat}`
  const entries = Object.keys(row.values)
    .sort()
    .map(k => `${k}=${cellStr(row.values[k])}`)
    .join('|')
  return `v:${entries.slice(0, 480)}`
}

function exportRowsWithColumns(cols: GeoExplorerDataTableColumn[], rows: GeoExplorerDataTableRow[]) {
  const head = cols.map(c => c.label)
  const body = rows.map(r => cols.map(c => cellStr(r.values[c.key])))
  return { head, body }
}

/** Parse `GRIDCODE IN (74,82,65)` or `Farm_Code IN (MH101, MH105)` (quotes optional). */
export function parseGeoAiTableFieldInQuery(q: string): { field: string; values: string[] } | null {
  const m = q.trim().match(/^([\w.]+)\s+IN\s*\(([^)]*)\)\s*$/is)
  if (!m) return null
  const field = m[1].trim()
  const inner = m[2] ?? ''
  const values = inner
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
  if (!field || !values.length) return null
  return { field, values }
}

export function GeoExplorerDynamicTable(props: GeoExplorerDynamicTableProps) {
  const {
    cssPrefix,
    table,
    onMapAction,
    onBatchZoom,
    tableSyncId,
    onSelectionLinksChange,
    mapFocusFeatureKey,
    onQuerySelectApplied,
  } = props
  const p = (part: string) => `${cssPrefix}-${part}`

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [chartOpen, setChartOpen] = useState(false)
  const [showMoreFields, setShowMoreFields] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const [queryExpr, setQueryExpr] = useState('')
  const shiftRangeAnchorIdxRef = useRef<number | null>(null)
  const scrollWrapRef = useRef<HTMLDivElement | null>(null)

  const hasHiddenByDefault = useMemo(
    () => table.columns.some(c => c.defaultVisible === false),
    [table.columns],
  )

  const displayColumns = useMemo(() => {
    if (showMoreFields || !hasHiddenByDefault) return table.columns
    return table.columns.filter(c => c.defaultVisible !== false)
  }, [table.columns, showMoreFields, hasHiddenByDefault])

  useEffect(() => {
    setSelectedKeys(new Set())
  }, [table.rows, table.columns, search, sortKey, sortDir])

  const hasMapCol = Boolean(onMapAction) && table.rows.some(r => r.mapLink)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return table.rows
    return table.rows.filter(row =>
      table.columns.some(c => cellStr(row.values[c.key]).toLowerCase().includes(q)),
    )
  }, [table.rows, table.columns, search])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const dir = sortDir === 'asc' ? 1 : -1
    const copy = [...filtered]
    copy.sort((a, b) => {
      const va = a.values[sortKey]
      const vb = b.values[sortKey]
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return cellStr(va).localeCompare(cellStr(vb), undefined, { numeric: true }) * dir
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize)

  const onSort = (key: string) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleRowKey = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAllOnPage = useCallback(() => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      for (const row of pageRows) next.add(stableRowKey(row))
      return next
    })
  }, [pageRows])

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), [])

  const selectedRows = useMemo(
    () => sorted.filter(r => selectedKeys.has(stableRowKey(r))),
    [sorted, selectedKeys],
  )

  useEffect(() => {
    if (!onSelectionLinksChange || !tableSyncId) return
    const links = sorted
      .filter(r => selectedKeys.has(stableRowKey(r)) && r.mapLink)
      .map(r => r.mapLink!) as GeoExplorerMapLink[]
    onSelectionLinksChange(tableSyncId, links)
  }, [selectedKeys, sorted, tableSyncId, onSelectionLinksChange])

  useEffect(() => {
    if (!mapFocusFeatureKey || !scrollWrapRef.current) return
    try {
      const el = scrollWrapRef.current.querySelector(`[data-geoai-fk="${CSS.escape(mapFocusFeatureKey)}"]`)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    } catch {
      /* ignore */
    }
  }, [mapFocusFeatureKey, safePage, sorted])

  const applyFieldInQuery = useCallback(() => {
    const parsed = parseGeoAiTableFieldInQuery(queryExpr)
    if (!parsed) return
    const { field, values } = parsed
    const lowered = values.map(v => v.toLowerCase())
    const next = new Set<string>()
    for (const row of table.rows) {
      const v = row.values[field]
      if (v === undefined || v === null) continue
      const s = cellStr(v)
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
      const hit =
        values.includes(s) ||
        lowered.includes(s.toLowerCase()) ||
        (Number.isFinite(n) && values.some(x => Number(String(x).replace(/,/g, '')) === n))
      if (hit) next.add(stableRowKey(row))
    }
    setSelectedKeys(next)
    setPage(0)
    onQuerySelectApplied?.()
  }, [queryExpr, table.rows, onQuerySelectApplied])

  const { chartLabels, chartDataNums } = useMemo(() => {
    const labelCol = displayColumns.find(c => c.align !== 'right') ?? displayColumns[0]
    const numCol = displayColumns.find(c => c.align === 'right')
    if (!labelCol || !numCol) return { chartLabels: [] as string[], chartDataNums: [] as number[] }
    const labels: string[] = []
    const nums: number[] = []
    for (const r of sorted.slice(0, 24)) {
      const lb = cellStr(r.values[labelCol.key]).slice(0, 32)
      const n = r.values[numCol.key]
      const nv = typeof n === 'number' ? n : Number(String(n).replace(/,/g, ''))
      if (!Number.isFinite(nv)) continue
      labels.push(lb || '—')
      nums.push(nv)
    }
    return { chartLabels: labels, chartDataNums: nums }
  }, [sorted, displayColumns])

  const chartJsData: ChartData<'bar'> | null =
    chartOpen && chartLabels.length && chartDataNums.length
      ? {
          labels: chartLabels,
          datasets: [
            {
              label: displayColumns.find(c => c.align === 'right')?.label ?? 'Value',
              data: chartDataNums,
              backgroundColor: 'rgba(167, 139, 250, 0.55)',
              borderColor: 'rgba(167, 139, 250, 1)',
              borderWidth: 1,
            },
          ],
        }
      : null

  const exportSubset = (rows: GeoExplorerDataTableRow[], label: string) => {
    const cols = showMoreFields ? table.columns : displayColumns
    const { head, body } = exportRowsWithColumns(cols, rows)
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const lines = [head.map(esc).join(','), ...body.map(row => row.map(esc).join(','))]
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(table.title ?? 'geo-ai-table').replace(/\s+/g, '_')}_${label}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const copyTsv = async () => {
    const cols = showMoreFields ? table.columns : displayColumns
    const { head, body } = exportRowsWithColumns(cols, sorted)
    const tsv = [head.join('\t'), ...body.map(line => line.join('\t'))].join('\n')
    try {
      await navigator.clipboard.writeText(tsv)
    } catch {
      /* ignore */
    }
  }

  const downloadCsv = () => exportSubset(sorted, 'all')

  const downloadXlsx = () => {
    const cols = showMoreFields ? table.columns : displayColumns
    const { head, body } = exportRowsWithColumns(cols, sorted)
    const ws = XLSX.utils.aoa_to_sheet([head, ...body])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, `${(table.title ?? 'geo-ai-table').replace(/\s+/g, '_')}.xlsx`)
  }

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
    doc.setFontSize(11)
    doc.text(table.title ?? 'Geo AI table', 40, 36)
    doc.setFontSize(8)
    doc.text(`${table.kind} · ${sorted.length} rows`, 40, 52)
    const cols = showMoreFields ? table.columns : displayColumns
    const { head, body } = exportRowsWithColumns(cols, sorted.slice(0, 500))
    autoTable(doc, {
      head: [head],
      body,
      startY: 64,
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [71, 85, 105], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    })
    doc.save(`${(table.title ?? 'geo-ai-table').replace(/\s+/g, '_')}.pdf`)
  }

  const batchZoomSelection = () => {
    const links = selectedRows.map(r => r.mapLink).filter(Boolean) as GeoExplorerMapLink[]
    if (links.length >= 2 && onBatchZoom) onBatchZoom(links)
    else if (links.length === 1 && onMapAction) onMapAction('zoom', links[0]!)
  }

  return (
    <div className={p('dyn-table')} role="region" aria-label={table.title ?? 'Data table'}>
      <div className={p('dyn-table-toolbar')}>
        <span className={p('dyn-table-badge')}>{table.kind}</span>
        {table.title ? <span className={p('dyn-table-title')}>{table.title}</span> : null}
        <span className={p('dyn-table-meta')}>
          {sorted.length}/{table.rows.length} rows
          {selectedKeys.size ? ` · ${selectedKeys.size} selected` : null}
          {hasMapCol ? (
            <span className={p('dyn-table-meta-hint')}>
              {' '}
              · Linked map · Ctrl/Shift + checkbox · Row click selects one
            </span>
          ) : null}
        </span>
      </div>
      {hasMapCol ? (
        <div className={p('dyn-table-query-row')}>
          <label className={p('dyn-table-query-label')}>
            <span>Query select</span>
            <input
              type="text"
              className={p('dyn-table-query-input')}
              value={queryExpr}
              placeholder='e.g. GRIDCODE IN (74,82,65) or Farm_Code IN (MH101, MH105)'
              onChange={e => setQueryExpr(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyFieldInQuery()
                }
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="Query select rows, FIELD IN (values)"
            />
          </label>
          <button type="button" className={p('dyn-table-btn')} onClick={applyFieldInQuery} title="Apply query to row selection">
            Apply query
          </button>
        </div>
      ) : null}
      <div className={p('dyn-table-controls')}>
        <label className={p('dyn-table-search')}>
          <i className="fa-solid fa-magnifying-glass" aria-hidden />
          <input
            type="search"
            aria-label="Search table"
            placeholder="Search…"
            value={search}
            onChange={e => {
              setSearch(e.target.value)
              setPage(0)
            }}
            autoComplete="off"
          />
        </label>
        {hasHiddenByDefault ? (
          <label className={p('dyn-table-toggle')}>
            <input
              type="checkbox"
              checked={showMoreFields}
              onChange={e => setShowMoreFields(e.target.checked)}
            />{' '}
            More fields
          </label>
        ) : null}
        <label className={p('dyn-table-pagesize')}>
          Rows
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value))
              setPage(0)
            }}
          >
            {PAGE_OPTS.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className={p('dyn-table-actions')}>
          {hasMapCol ? (
            <>
              <button type="button" className={p('dyn-table-btn')} onClick={selectAllOnPage} title="Select all rows on this page">
                Select page
              </button>
              <button type="button" className={p('dyn-table-btn')} onClick={clearSelection} disabled={!selectedKeys.size}>
                Clear sel.
              </button>
              <button
                type="button"
                className={p('dyn-table-btn')}
                disabled={!selectedRows.some(r => r.mapLink)}
                onClick={batchZoomSelection}
                title="Zoom map to combined extent of selected features"
              >
                <i className="fa-solid fa-expand" aria-hidden /> Zoom selection
              </button>
              <button
                type="button"
                className={p('dyn-table-btn')}
                disabled={!selectedKeys.size}
                onClick={() => exportSubset(selectedRows, 'selection')}
              >
                CSV selection
              </button>
            </>
          ) : null}
          <button type="button" className={p('dyn-table-btn')} onClick={copyTsv} title="Copy as TSV">
            <i className="fa-regular fa-copy" aria-hidden /> Copy
          </button>
          <button type="button" className={p('dyn-table-btn')} onClick={downloadCsv}>
            CSV
          </button>
          <button type="button" className={p('dyn-table-btn')} onClick={downloadXlsx}>
            Excel
          </button>
          <button type="button" className={p('dyn-table-btn')} onClick={downloadPdf}>
            PDF
          </button>
          <button
            type="button"
            className={`${p('dyn-table-btn')} ${chartOpen ? p('dyn-table-btn--active') : ''}`}
            onClick={() => setChartOpen(c => !c)}
            title="Quick bar chart from first label + numeric column"
          >
            <i className="fa-solid fa-chart-column" aria-hidden /> Chart
          </button>
        </div>
      </div>

      {chartJsData ? (
        <div className={p('dyn-table-chart')}>
          <Bar
            data={chartJsData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { maxRotation: 45, minRotation: 0 } },
              },
            }}
          />
        </div>
      ) : null}

      <div className={p('dyn-table-scroll')} ref={scrollWrapRef}>
        <table
          className={p('dyn-table-grid')}
          title={
            hasMapCol
              ? 'Use checkboxes for multi-select; row click highlights map; use Table icon for attribute dock.'
              : undefined
          }
        >
          <thead>
            <tr>
              {hasMapCol ? (
                <th className={p('dyn-table-sel-col')} scope="col">
                  <span className={p('dyn-table-sel-hint')}>Sel</span>
                </th>
              ) : null}
              {displayColumns.map(c => (
                <th key={c.key} className={c.align === 'right' ? p('dyn-table-th-numeric') : undefined}>
                  <button type="button" className={p('dyn-table-sort')} onClick={() => onSort(c.key)}>
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
              {hasMapCol ? <th className={p('dyn-table-map-col')}>Map</th> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, ri) => {
              const rk = stableRowKey(row)
              const sel = selectedKeys.has(rk)
              const idxGlobal = sorted.findIndex(r => stableRowKey(r) === rk)
              const fk =
                row.mapLink?.type === 'feature' ? stableFeatureLinkKey(row.mapLink) : null
              const mapFocus = fk && mapFocusFeatureKey === fk
              return (
                <tr
                  key={`${safePage}-${ri}-${rk}`}
                  data-geoai-fk={fk ?? undefined}
                  className={[
                    row.mapLink ? p('dyn-table-row--interactive') : '',
                    sel ? p('dyn-table-row--selected') : '',
                    mapFocus ? p('dyn-table-row--map-focus') : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={ev => {
                    if ((ev.target as HTMLElement).closest('input,button,a,label')) return
                    if (!row.mapLink || !onMapAction) return
                    if ((ev.target as HTMLElement).closest('button')) return
                    if (ev.ctrlKey || ev.metaKey) {
                      ev.preventDefault()
                      toggleRowKey(rk)
                      onMapAction('highlight', row.mapLink)
                      return
                    }
                    if (ev.shiftKey && idxGlobal >= 0 && shiftRangeAnchorIdxRef.current != null) {
                      ev.preventDefault()
                      const a = Math.min(shiftRangeAnchorIdxRef.current, idxGlobal)
                      const b = Math.max(shiftRangeAnchorIdxRef.current, idxGlobal)
                      setSelectedKeys(prev => {
                        const next = new Set(prev)
                        for (let j = a; j <= b; j++) {
                          const rj = sorted[j]
                          if (rj?.mapLink) next.add(stableRowKey(rj))
                        }
                        return next
                      })
                      onMapAction('highlight', row.mapLink)
                      return
                    }
                    shiftRangeAnchorIdxRef.current = idxGlobal >= 0 ? idxGlobal : null
                    setSelectedKeys(new Set([rk]))
                    onMapAction('highlight', row.mapLink)
                  }}
                >
                  {hasMapCol ? (
                    <td className={p('dyn-table-sel-cell')} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={sel}
                        aria-label="Select row for map / export"
                        onClick={e => {
                          e.stopPropagation()
                          if (idxGlobal < 0) return
                          if (e.shiftKey && shiftRangeAnchorIdxRef.current != null) {
                            const a = Math.min(shiftRangeAnchorIdxRef.current, idxGlobal)
                            const b = Math.max(shiftRangeAnchorIdxRef.current, idxGlobal)
                            setSelectedKeys(prev => {
                              const next = new Set(prev)
                              for (let j = a; j <= b; j++) {
                                const rj = sorted[j]
                                if (rj?.mapLink) next.add(stableRowKey(rj))
                              }
                              return next
                            })
                            return
                          }
                          if (e.ctrlKey || e.metaKey) {
                            toggleRowKey(rk)
                            shiftRangeAnchorIdxRef.current = idxGlobal
                            return
                          }
                          toggleRowKey(rk)
                          shiftRangeAnchorIdxRef.current = idxGlobal
                        }}
                        onChange={() => {}}
                      />
                    </td>
                  ) : null}
                  {displayColumns.map(c => (
                    <td key={c.key} className={c.align === 'right' ? p('dyn-table-td-numeric') : undefined}>
                      {cellStr(row.values[c.key]) || '—'}
                    </td>
                  ))}
                  {hasMapCol ? (
                    <td className={p('dyn-table-map-cell')}>
                      {row.mapLink ? (
                        <span className={p('dyn-table-map-btns')}>
                          <button
                            type="button"
                            className={p('dyn-table-icon-btn')}
                            title="Zoom to feature"
                            onClick={ev => {
                              ev.stopPropagation()
                              onMapAction?.('zoom', row.mapLink!)
                            }}
                          >
                            <i className="fa-solid fa-magnifying-glass-location" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={p('dyn-table-icon-btn')}
                            title="Highlight on map"
                            onClick={ev => {
                              ev.stopPropagation()
                              onMapAction?.('highlight', row.mapLink!)
                            }}
                          >
                            <i className="fa-solid fa-highlighter" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className={p('dyn-table-icon-btn')}
                            title="Open linked attribute table"
                            onClick={ev => {
                              ev.stopPropagation()
                              onMapAction?.('openTable', row.mapLink!)
                            }}
                          >
                            <i className="fa-solid fa-table" aria-hidden />
                          </button>
                        </span>
                      ) : (
                        <span className={p('dyn-table-dash')}>—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {table.foot && Object.keys(table.foot).length ? (
        <div className={p('dyn-table-foot')}>
          {Object.entries(table.foot).map(([k, v]) => (
            <div key={k} className={p('dyn-table-foot-line')}>
              {k === 'Summary' ? (
                cellStr(v)
              ) : (
                <>
                  <strong>{k}:</strong> {cellStr(v)}
                </>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className={p('dyn-table-pagination')}>
        <button
          type="button"
          className={p('dyn-table-btn')}
          disabled={safePage <= 0}
          onClick={() => setPage(p => Math.max(0, p - 1))}
        >
          Prev
        </button>
        <span>
          Page {safePage + 1} / {pageCount}
        </span>
        <button
          type="button"
          className={p('dyn-table-btn')}
          disabled={safePage >= pageCount - 1}
          onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
        >
          Next
        </button>
      </div>
    </div>
  )
}
