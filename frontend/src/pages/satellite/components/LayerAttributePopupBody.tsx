import { useMemo, useState, useCallback } from 'react'
import type { SiPopupInspectPayload } from '../../../lib/siLayerPopupInspect'
import {
  copyTextToClipboard,
  downloadTextFile,
  extractAoiFromRows,
  extractNdviFromRows,
  filterEmptyRows,
  flattenInspectRows,
  isEmptyAttributeValue,
  isImageUrl,
  isMediaValue,
  ndviHealthLabel,
  parseNumericFieldValue,
  rowsToCsv,
} from '../../../lib/layerAttributePopupUtils'
import './layer-attribute-popup.css'

export type LayerAttributePopupBodyProps = {
  inspect: SiPopupInspectPayload
  /** ArcGIS identify table (default) or rich explorer UI. */
  variant?: 'arcgis' | 'rich'
  /** Right-to-left layout (Arabic). */
  rtl?: boolean
  hideEmpty?: boolean
  coords?: { lat: number; lng: number }
  aoiName?: string | null
  spatialAnalysis?: Array<{ label: string; value: string }>
  relatedRecords?: Array<{ table: string; rows: { label: string; value: string }[] }>
  maxVisibleRows?: number
}

type TabKey = 'attributes' | 'relations' | 'media' | 'analysis'

function filterSearch<T extends { label: string; value: string }>(rows: T[], q: string): T[] {
  const s = q.trim().toLowerCase()
  if (!s) return rows
  return rows.filter(r => r.label.toLowerCase().includes(s) || r.value.toLowerCase().includes(s))
}

function MiniSpark({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((Math.abs(value) / max) * 100)) : 0
  return (
    <span className="lap-mini-spark" aria-hidden>
      <span className="lap-mini-spark__fill" style={{ width: `${pct}%` }} />
    </span>
  )
}

function MediaValue({ value }: { value: string }) {
  const v = value.trim()
  if (isImageUrl(v)) {
    return (
      <a className="lap-media lap-media--image" href={v} target="_blank" rel="noopener noreferrer">
        <img src={v} alt="" loading="lazy" />
      </a>
    )
  }
  if (isMediaValue(v)) {
    return (
      <a className="lap-media lap-media--link" href={v.startsWith('http') ? v : `https://${v}`} target="_blank" rel="noopener noreferrer">
        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
        <span>{v}</span>
      </a>
    )
  }
  return <span className="lap-row-v">{v}</span>
}

export function LayerAttributePopupBody({
  inspect,
  variant = 'arcgis',
  rtl = false,
  hideEmpty = true,
  coords,
  aoiName,
  spatialAnalysis,
  relatedRecords,
  maxVisibleRows = 120,
}: LayerAttributePopupBodyProps) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<TabKey>('attributes')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)

  const allRows = useMemo(() => inspect.sections.flatMap(s => s.rows), [inspect.sections])
  const ndvi = useMemo(() => extractNdviFromRows(allRows), [allRows])
  const aoi = aoiName ?? extractAoiFromRows(allRows)
  const numericMax = useMemo(() => {
    let max = 0
    for (const r of allRows) {
      const n = parseNumericFieldValue(r.value)
      if (n != null && Math.abs(n) > max) max = Math.abs(n)
    }
    return max || 1
  }, [allRows])

  const sections = useMemo(() => {
    return inspect.sections.map(sec => {
      let rows = sec.rows
      if (hideEmpty) rows = filterEmptyRows(rows)
      rows = filterSearch(rows, q)
      return { ...sec, rows }
    }).filter(sec => sec.rows.length > 0)
  }, [inspect.sections, hideEmpty, q])

  const rel = useMemo(() => {
    let rows = inspect.relationRows
    if (hideEmpty) rows = filterEmptyRows(rows)
    return filterSearch(rows, q)
  }, [inspect.relationRows, hideEmpty, q])

  const med = useMemo(() => {
    let rows = inspect.mediaRows
    if (hideEmpty) rows = filterEmptyRows(rows)
    return filterSearch(rows, q)
  }, [inspect.mediaRows, hideEmpty, q])

  const flatForExport = useMemo(() => flattenInspectRows(inspect, hideEmpty), [inspect, hideEmpty])
  const fieldCount = flatForExport.length
  const filledCount = flatForExport.filter(r => !isEmptyAttributeValue(r.value)).length

  const analysisRows = useMemo(() => {
    const base = spatialAnalysis ?? []
    if (hideEmpty) return filterEmptyRows(base)
    return base
  }, [spatialAnalysis, hideEmpty])

  const showTabs =
    inspect.presentation === 'tabbed' ||
    inspect.presentation === 'relationship' ||
    rel.length + med.length + analysisRows.length + (relatedRecords?.length ?? 0) > 0

  const handleCopyAll = useCallback(() => {
    void copyTextToClipboard(rowsToCsv(flatForExport).replace(/,/g, '\t'))
  }, [flatForExport])

  const handleExport = useCallback(() => {
    downloadTextFile('feature-attributes.csv', rowsToCsv(flatForExport), 'text/csv;charset=utf-8')
  }, [flatForExport])

  const renderRow = (r: { key?: string; label: string; value: string }, rk: string) => {
    const num = parseNumericFieldValue(r.value)
    const showSpark = num != null && !isMediaValue(r.value)
    return (
      <div key={rk} className="lap-row">
        <div className="lap-row-k">{r.label}</div>
        <div className="lap-row-v-wrap">
          {showSpark ? (
            <div className="lap-row-v-num">
              <MediaValue value={r.value} />
              <MiniSpark value={num} max={numericMax} />
            </div>
          ) : (
            <MediaValue value={r.value} />
          )}
        </div>
        <button
          type="button"
          className="lap-row-copy"
          title="نسخ"
          aria-label={`نسخ ${r.label}`}
          onClick={() => void copyTextToClipboard(r.value)}
        >
          <i className="fa-regular fa-copy" aria-hidden />
        </button>
      </div>
    )
  }

  const visibleLimit = showAll ? Number.POSITIVE_INFINITY : maxVisibleRows
  let rendered = 0

  const arcgisRows = useMemo(() => {
    let rows = inspect.sections.flatMap(s => s.rows)
    if (hideEmpty) rows = filterEmptyRows(rows)
    return rows
  }, [inspect.sections, hideEmpty])

  if (variant === 'arcgis') {
    const visibleRows = showAll ? arcgisRows : arcgisRows.slice(0, maxVisibleRows)
    return (
      <div className="lap-body lap-body--arcgis" dir="ltr">
        {visibleRows.length ? (
          <dl className="gis-map-popup-dl">
            {visibleRows.map((r, i) => (
              <div key={`${r.key ?? r.label}-${i}`} className="gis-map-popup-row">
                <dt className="gis-map-popup-k">{r.label}</dt>
                <dd className="gis-map-popup-v">
                  {isMediaValue(r.value) ? <MediaValue value={r.value} /> : r.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="lap-empty">No attributes to display.</p>
        )}
        {!showAll && arcgisRows.length > maxVisibleRows ? (
          <button type="button" className="lap-load-more" onClick={() => setShowAll(true)}>
            Show more ({arcgisRows.length - maxVisibleRows}+)
          </button>
        ) : null}
      </div>
    )
  }

  const renderAttrBody = () => (
    <div className="lap-scroll">
      {sections.map(sec => {
        const isCollapsed = collapsed[sec.id]
        const rows = sec.rows.slice(0, Math.max(0, visibleLimit - rendered))
        rendered += rows.length
        if (!rows.length && rendered >= visibleLimit) return null
        return (
          <section key={sec.id} className="lap-section">
            <button
              type="button"
              className="lap-section-head"
              onClick={() => setCollapsed(c => ({ ...c, [sec.id]: !c[sec.id] }))}
              aria-expanded={!isCollapsed}
            >
              <span>{sec.title}</span>
              <span className="lap-section-count">{sec.rows.length}</span>
              <i className={`fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}`} aria-hidden />
            </button>
            {!isCollapsed ? <div className="lap-section-body">{rows.map((r, i) => renderRow(r, `${sec.id}-${i}`))}</div> : null}
          </section>
        )
      })}
      {!showAll && rendered >= maxVisibleRows ? (
        <button type="button" className="lap-load-more" onClick={() => setShowAll(true)}>
          عرض المزيد ({fieldCount - rendered}+)
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="lap-body" dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? 'ar' : undefined}>
      {(ndvi != null || aoi || coords) && (
        <div className="lap-kpi-strip">
          {ndvi != null ? (
            <div className={`lap-kpi lap-kpi--ndvi lap-kpi--${ndviHealthLabel(ndvi).tone}`}>
              <span className="lap-kpi-label">NDVI</span>
              <strong className="lap-kpi-value">{ndvi.toFixed(3)}</strong>
              <span className="lap-kpi-sub">{ndviHealthLabel(ndvi).label}</span>
            </div>
          ) : null}
          {aoi ? (
            <div className="lap-kpi lap-kpi--aoi">
              <span className="lap-kpi-label">AOI</span>
              <strong className="lap-kpi-value">{aoi}</strong>
            </div>
          ) : null}
          {coords ? (
            <div className="lap-kpi lap-kpi--coords" dir="ltr">
              <span className="lap-kpi-label">إحداثيات</span>
              <strong className="lap-kpi-value">
                {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
              </strong>
            </div>
          ) : null}
        </div>
      )}

      <div className="lap-stats">
        <span>{filledCount} / {fieldCount} حقول</span>
        {hideEmpty ? <span className="lap-stats-tag">إخفاء الفارغ</span> : null}
      </div>

      <div className="lap-toolbar">
        <input
          type="search"
          className="lap-search"
          placeholder="بحث في الحقول…"
          value={q}
          onChange={e => setQ(e.target.value)}
          aria-label="بحث في الحقول"
        />
        <button type="button" className="lap-tool" title="نسخ الكل" onClick={handleCopyAll}>
          <i className="fa-regular fa-copy" aria-hidden />
        </button>
        <button type="button" className="lap-tool" title="تصدير CSV" onClick={handleExport}>
          <i className="fa-solid fa-file-export" aria-hidden />
        </button>
      </div>

      {showTabs ? (
        <div className="lap-tabs" role="tablist">
          {(['attributes', 'relations', 'media', 'analysis'] as TabKey[]).map(key => {
            const labels: Record<TabKey, string> = {
              attributes: 'الخصائص',
              relations: 'مرتبطة',
              media: 'وسائط',
              analysis: 'تحليل',
            }
            const count =
              key === 'relations'
                ? rel.length + (relatedRecords?.length ?? 0)
                : key === 'media'
                  ? med.length
                  : key === 'analysis'
                    ? analysisRows.length
                    : sections.reduce((n, s) => n + s.rows.length, 0)
            if (key !== 'attributes' && count === 0) return null
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`lap-tab${tab === key ? ' lap-tab--on' : ''}`}
                onClick={() => setTab(key)}
              >
                {labels[key]}
                {count > 0 && key !== 'attributes' ? <span className="lap-tab-badge">{count}</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {(!showTabs || tab === 'attributes') && renderAttrBody()}

      {showTabs && tab === 'relations' ? (
        <div className="lap-scroll">
          {relatedRecords?.map(rec => (
            <section key={rec.table} className="lap-section">
              <div className="lap-section-head lap-section-head--static">{rec.table}</div>
              <div className="lap-section-body">{rec.rows.map((r, i) => renderRow(r, `rel-t-${i}`))}</div>
            </section>
          ))}
          {rel.length ? rel.map((r, i) => renderRow(r, `rel-${i}`)) : null}
          {!rel.length && !relatedRecords?.length ? <p className="lap-empty">لا توجد جداول مرتبطة.</p> : null}
        </div>
      ) : null}

      {showTabs && tab === 'media' ? (
        <div className="lap-scroll lap-scroll--media">
          {med.length ? med.map((r, i) => renderRow(r, `med-${i}`)) : <p className="lap-empty">لا توجد صور أو مرفقات.</p>}
        </div>
      ) : null}

      {showTabs && tab === 'analysis' ? (
        <div className="lap-scroll">
          {analysisRows.length ? analysisRows.map((r, i) => renderRow(r, `an-${i}`)) : (
            <p className="lap-empty">لا توجد نتائج تحليل مكاني لهذا المعلم.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
