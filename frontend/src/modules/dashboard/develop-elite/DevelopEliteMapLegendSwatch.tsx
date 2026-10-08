import type { DevelopEliteMapLegendRow } from './developEliteMapLegend'

export function DevelopEliteMapLegendSwatch({ item }: { item: DevelopEliteMapLegendRow }) {
  if (item.symbolStyle === 'directional-line') {
    const stroke = item.outlineColor || '#004da8'
    const w = Math.max(2, Math.min(5, item.outlineWidth))
    return (
      <span className="develop-elite-map__legend-swatch develop-elite-map__legend-swatch--directional-line" aria-hidden>
        <svg width="52" height="14" viewBox="0 0 52 14">
          <line x1="1" y1="7" x2="36" y2="7" stroke={stroke} strokeWidth={w} strokeLinecap="round" />
          <polygon points="38,7 50,2 50,12" fill={stroke} />
        </svg>
      </span>
    )
  }
  const preview = item.symbolStyle === 'point' ? item.pointPreview : undefined
  if (preview?.kind === 'picture' && preview.imageUrl) {
    const w = preview.imageWidth ?? 18
    const h = preview.imageHeight ?? 18
    const scale = Math.min(1, 16 / Math.max(w, h))
    return (
      <img
        className="develop-elite-map__legend-swatch develop-elite-map__legend-swatch--point-img"
        src={preview.imageUrl}
        alt=""
        width={Math.max(12, Math.round(w * scale))}
        height={Math.max(12, Math.round(h * scale))}
        aria-hidden
      />
    )
  }
  if (preview) {
    const r = Math.max(3, Math.min(7, preview.radius))
    return (
      <span className="develop-elite-map__legend-swatch develop-elite-map__legend-swatch--point" aria-hidden>
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle
            cx="8"
            cy="8"
            r={r}
            fill={preview.fillColor}
            stroke={preview.strokeColor}
            strokeWidth={preview.strokeWidth}
          />
        </svg>
      </span>
    )
  }
  return (
    <span
      className={`develop-elite-map__legend-swatch${item.hollow ? ' is-hollow' : ''}`}
      style={{
        backgroundColor: item.hollow ? 'transparent' : item.fillColor,
        borderColor: item.outlineColor,
        borderWidth: Math.max(1, item.outlineWidth),
      }}
      aria-hidden
    />
  )
}

/** Compact symbology for the Layers panel (single class or multi-class strip). */
export function DevelopEliteMapDataLayerSwatch({ rows }: { rows: DevelopEliteMapLegendRow[] }) {
  if (!rows.length) return null
  if (rows.length === 1) {
    return (
      <span className="develop-elite-map__data-layer-swatch">
        <DevelopEliteMapLegendSwatch item={rows[0]} />
      </span>
    )
  }
  return (
    <span className="develop-elite-map__data-layer-swatch develop-elite-map__data-layer-swatch--multi" aria-hidden>
      {rows.slice(0, 4).map(row => (
        <span
          key={row.id}
          className={`develop-elite-map__data-layer-swatch-segment${row.hollow ? ' is-hollow' : ''}`}
          style={{
            backgroundColor: row.hollow ? 'transparent' : row.fillColor,
            borderColor: row.outlineColor,
          }}
        />
      ))}
    </span>
  )
}
