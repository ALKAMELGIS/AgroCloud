import { useMemo, useState } from 'react';
import type { ArcgisLayerDefLite } from '../../../lib/arcgisAttributeDisplay';
import {
  arcgisPointSymbolPreviewFromDrawingInfo,
  uniqueValuePointSymbolPreviews,
  type ArcgisPointSymbolPreview,
} from '../../../lib/arcgisPointSymbol';
import { buildArcgisUniqueValueLegendItems } from '../../../lib/arcgisDrawingInfoMapbox';
import type { SiStrokeStyle, SiSymbologyAppearance } from '../siSymbolStyleStudio';
import { strokeDashSvgFromStyle } from '../siSymbolStyleStudio';
import {
  SI_POINT_SYMBOL_CATEGORIES,
  SI_POINT_SYMBOL_GALLERY,
  type SiPointSymbolGalleryItem,
} from '../siPointSymbolGallery'
import {
  SI_POLYGON_SYMBOL_CATEGORIES,
  SI_POLYGON_SYMBOL_GALLERY,
  applySiPolygonGalleryItem,
  type SiPolygonSymbolGalleryItem,
} from '../siPolygonSymbolGallery'
import './SiPointSymbolSection.css'

function hexColorOr(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : fallback
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function PolygonGallerySwatch({ item }: { item: SiPolygonSymbolGalleryItem }) {
  return (
    <svg className="si-sym-poly-swatch" width="36" height="28" viewBox="0 0 36 28" aria-hidden>
      <rect x="0.5" y="0.5" width="35" height="27" rx="2" fill="#ffffff" stroke="rgba(15,23,42,0.12)" />
      <rect
        x="7"
        y="6"
        width="22"
        height="16"
        rx="1.5"
        fill={item.fillColor}
        fillOpacity={item.polygonFillAlpha}
        stroke={item.strokeColor}
        strokeWidth={Math.max(1, Math.min(3.5, item.weight))}
        strokeDasharray={strokeDashSvgFromStyle(item.strokeStyle) || undefined}
      />
    </svg>
  )
}

function PointSymbolSvg({
  preview,
  size = 48,
}: {
  preview: Pick<ArcgisPointSymbolPreview, 'kind' | 'fillColor' | 'strokeColor' | 'strokeWidth' | 'radius' | 'imageUrl' | 'imageWidth' | 'imageHeight'>;
  size?: number;
}) {
  if (preview.kind === 'picture' && preview.imageUrl) {
    const w = preview.imageWidth ?? 24;
    const h = preview.imageHeight ?? 24;
    const scale = Math.min(1, (size - 8) / Math.max(w, h));
    return (
      <img
        className="si-sym-point-img"
        src={preview.imageUrl}
        alt=""
        width={Math.round(w * scale)}
        height={Math.round(h * scale)}
        onError={() => console.error('[si-point-symbol] Failed to load picture marker image')}
      />
    );
  }
  const r = Math.max(3, Math.min(16, preview.radius));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={preview.fillColor}
        stroke={preview.strokeColor}
        strokeWidth={preview.strokeWidth}
        opacity={preview.kind === 'unknown' ? 0.5 : 1}
      />
    </svg>
  );
}

function GalleryShapeSvg({ item, active }: { item: SiPointSymbolGalleryItem; active: boolean }) {
  const cx = 18;
  const cy = 18;
  const r = 7;
  const common = {
    fill: item.fillColor,
    stroke: item.strokeColor,
    strokeWidth: active ? 2.5 : 1.5,
  };
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      {item.shape === 'circle' ? <circle cx={cx} cy={cy} r={r} {...common} /> : null}
      {item.shape === 'square' ? <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} /> : null}
      {item.shape === 'diamond' ? (
        <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...common} />
      ) : null}
      {item.shape === 'triangle' ? (
        <polygon points={`${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`} {...common} />
      ) : null}
      {item.shape === 'star' ? (
        <polygon
          points={`${cx},${cy - r} ${cx + 2},${cy - 1} ${cx + r},${cy - 1} ${cx + 3},${cy + 2} ${cx + 5},${cy + r} ${cx},${cy + 4} ${cx - 5},${cy + r} ${cx - 3},${cy + 2} ${cx - r},${cy - 1} ${cx - 2},${cy - 1}`}
          {...common}
        />
      ) : null}
    </svg>
  );
}

type SiPointSymbolSectionProps = {
  geometryKind: 'point' | 'line' | 'polygon' | 'other';
  arcgisLocked: boolean;
  drawingInfo?: unknown;
  appearance: SiSymbologyAppearance;
  onAppearanceChange: (patch: Partial<SiSymbologyAppearance>) => void;
  selectedGalleryId?: string;
  onGallerySelect?: (item: SiPointSymbolGalleryItem) => void;
};

export function SiPointSymbolSection({
  geometryKind,
  arcgisLocked,
  drawingInfo,
  appearance,
  onAppearanceChange,
  selectedGalleryId,
  onGallerySelect,
}: SiPointSymbolSectionProps) {
  const [gallerySearch, setGallerySearch] = useState('');
  const [galleryCategory, setGalleryCategory] = useState<string>('All');
  const [polygonGallerySearch, setPolygonGallerySearch] = useState('');
  const [polygonGalleryCategory, setPolygonGalleryCategory] = useState<string>('All');
  const [selectedPolygonSymbolId, setSelectedPolygonSymbolId] = useState<string | undefined>();

  const arcgisPreview = useMemo(() => {
    if (!arcgisLocked) return null;
    return arcgisPointSymbolPreviewFromDrawingInfo(drawingInfo, appearance.opacity);
  }, [arcgisLocked, drawingInfo, appearance.opacity]);

  const arcgisUniquePreviews = useMemo(() => {
    if (!arcgisLocked || !drawingInfo) return [];
    const ren = (drawingInfo as any)?.renderer;
    return uniqueValuePointSymbolPreviews(ren, appearance.opacity, 64);
  }, [arcgisLocked, drawingInfo, appearance.opacity]);

  const filteredGallery = useMemo(() => {
    const q = gallerySearch.trim().toLowerCase();
    return SI_POINT_SYMBOL_GALLERY.filter(item => {
      if (galleryCategory !== 'All' && item.category !== galleryCategory) return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [gallerySearch, galleryCategory]);

  const filteredPolygonGallery = useMemo(() => {
    const q = polygonGallerySearch.trim().toLowerCase();
    return SI_POLYGON_SYMBOL_GALLERY.filter(item => {
      if (polygonGalleryCategory !== 'All' && item.category !== polygonGalleryCategory) return false;
      if (!q) return true;
      return item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
    });
  }, [polygonGallerySearch, polygonGalleryCategory]);

  const arcgisPolygonLegend = useMemo(() => {
    if (!arcgisLocked || geometryKind !== 'polygon' || !drawingInfo) return [];
    return buildArcgisUniqueValueLegendItems(drawingInfo, appearance.opacity);
  }, [arcgisLocked, geometryKind, drawingInfo, appearance.opacity]);

  if (geometryKind !== 'point') {
    if (arcgisLocked && geometryKind === 'polygon' && arcgisPolygonLegend.length > 0) {
      return (
        <div className="si-sym-point-arcgis">
          <p className="si-sym-point-arcgis__badge">ArcGIS Online symbology (locked)</p>
          <p className="si-sym-muted">{arcgisPolygonLegend.length} Structure_Type subtypes</p>
          <div className="si-sym-point-gallery si-sym-point-gallery--readonly">
            {arcgisPolygonLegend.map(it => (
              <div
                key={`${it.value}-${it.label}`}
                className="si-sym-point-gallery__item si-sym-point-gallery__item--readonly"
                title={`${it.label} (${it.value})`}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
                  <rect
                    x="6"
                    y="8"
                    width="20"
                    height="16"
                    rx="2"
                    fill={it.hollow ? 'transparent' : it.fillColor}
                    stroke={it.outlineColor}
                    strokeWidth={Math.max(1, it.outlineWidth)}
                  />
                </svg>
                <span>{it.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    const outline = hexColorOr(appearance.color, '#000000')
    const fill = hexColorOr(appearance.fillColor, '#000000')
    const fillAlpha = clamp01(appearance.polygonFillAlpha)
    const strokeStyle: SiStrokeStyle =
      appearance.strokeStyle === 'dashed' ||
      appearance.strokeStyle === 'dotted' ||
      appearance.strokeStyle === 'dashdot' ||
      appearance.strokeStyle === 'solid'
        ? appearance.strokeStyle
        : 'solid'
    const isPolygon = geometryKind === 'polygon'
    return (
      <>
        <div className="si-sym-preview" aria-hidden>
          <svg width="72" height="36" viewBox="0 0 72 36">
            {geometryKind === 'line' ? (
              <line
                x1="8"
                y1="18"
                x2="64"
                y2="18"
                stroke={outline}
                strokeWidth={appearance.weight}
                strokeDasharray={strokeDashSvgFromStyle(strokeStyle) || undefined}
              />
            ) : (
              <rect
                x="18"
                y="8"
                width="36"
                height="20"
                rx={appearance.previewCornerRadius}
                fill={fill}
                fillOpacity={fillAlpha}
                stroke={outline}
                strokeWidth={appearance.weight}
                strokeDasharray={strokeDashSvgFromStyle(strokeStyle) || undefined}
              />
            )}
          </svg>
        </div>

        {isPolygon ? (
          <div className="si-sym-poly-gallery-block">
            <div className="si-sym-poly-gallery-head">
              <span>Symbols found: {filteredPolygonGallery.length}</span>
              <span className="si-sym-poly-gallery-head__hint">ArcGIS 2D</span>
            </div>
            <label className="si-sym-field">
              <span className="si-sym-field__label">Search symbols</span>
              <input
                className="si-sym-input"
                type="search"
                placeholder="Filter gallery…"
                value={polygonGallerySearch}
                onChange={e => setPolygonGallerySearch(e.target.value)}
              />
            </label>
            <div className="si-sym-point-cats" role="tablist" aria-label="Polygon symbol categories">
              {SI_POLYGON_SYMBOL_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  role="tab"
                  className={`si-sym-point-cat${polygonGalleryCategory === cat ? ' si-sym-point-cat--active' : ''}`}
                  onClick={() => setPolygonGalleryCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="si-sym-point-gallery si-sym-poly-gallery" role="list">
              {filteredPolygonGallery.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className={`si-sym-point-gallery__item${
                    selectedPolygonSymbolId === item.id ? ' si-sym-point-gallery__item--active' : ''
                  }`}
                  title={item.label}
                  onClick={() => {
                    setSelectedPolygonSymbolId(item.id)
                    onAppearanceChange(applySiPolygonGalleryItem(item))
                  }}
                >
                  <PolygonGallerySwatch item={item} />
                  <span>{item.label}</span>
                </button>
              ))}
              {!filteredPolygonGallery.length ? (
                <p className="si-sym-muted">No symbols match your search.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="si-sym-grid">
          <label className="si-sym-field">
            <span className="si-sym-field__label">Outline</span>
            <input
              className="si-sym-color"
              type="color"
              value={outline}
              onChange={e => onAppearanceChange({ color: e.target.value })}
            />
          </label>
          <label className="si-sym-field">
            <span className="si-sym-field__label">Outline width ({appearance.weight.toFixed(1)}px)</span>
            <input
              className="si-sym-range"
              type="range"
              min={5}
              max={80}
              value={Math.round(Math.max(0.5, appearance.weight) * 10)}
              onChange={e => onAppearanceChange({ weight: Number(e.target.value) / 10 })}
            />
          </label>
          <label className="si-sym-field">
            <span className="si-sym-field__label">Outline style</span>
            <select
              className="si-sym-input"
              value={strokeStyle}
              onChange={e => onAppearanceChange({ strokeStyle: e.target.value as SiStrokeStyle })}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="dashdot">Dash-dot</option>
            </select>
          </label>
          {isPolygon ? (
            <>
              <label className="si-sym-field">
                <span className="si-sym-field__label">Fill</span>
                <input
                  className="si-sym-color"
                  type="color"
                  value={fill}
                  onChange={e => onAppearanceChange({ fillColor: e.target.value })}
                />
              </label>
              <label className="si-sym-field">
                <span className="si-sym-field__label">
                  Fill transparency ({Math.round((1 - fillAlpha) * 100)}%)
                </span>
                <input
                  className="si-sym-range"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round((1 - fillAlpha) * 100)}
                  onChange={e =>
                    onAppearanceChange({ polygonFillAlpha: clamp01(1 - Number(e.target.value) / 100) })
                  }
                />
              </label>
            </>
          ) : null}
        </div>
      </>
    );
  }

  if (arcgisLocked) {
    return (
      <div className="si-sym-point-arcgis">
        <p className="si-sym-point-arcgis__badge">ArcGIS Online symbol (locked)</p>
        {arcgisPreview ? (
          <>
            <div className="si-sym-point-arcgis__preview">
              <PointSymbolSvg preview={arcgisPreview} size={56} />
              <div className="si-sym-point-arcgis__meta">
                <strong>{arcgisPreview.label}</strong>
                <span>{arcgisPreview.symbolType}</span>
                {arcgisPreview.kind === 'circle' ? (
                  <span>
                    {arcgisPreview.fillColor} · {Math.round(arcgisPreview.radius * 2)}px · outline{' '}
                    {arcgisPreview.strokeWidth}px
                  </span>
                ) : (
                  <span>
                    {arcgisPreview.imageWidth}×{arcgisPreview.imageHeight}px picture marker
                  </span>
                )}
              </div>
            </div>
            {arcgisUniquePreviews.length > 1 ? (
              <div className="si-sym-point-gallery si-sym-point-gallery--readonly">
                {arcgisUniquePreviews.map((p, i) => (
                  <div key={`${p.label}-${i}`} className="si-sym-point-gallery__item si-sym-point-gallery__item--readonly" title={p.label}>
                    <PointSymbolSvg preview={p} size={32} />
                    <span>{p.label}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="si-sym-muted">
            Could not load point symbol from drawingInfo. Sync the layer or disable ArcGIS Online symbology to edit manually.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="si-sym-preview" aria-hidden>
        <PointSymbolSvg
          preview={{
            kind: 'circle',
            fillColor: appearance.fillColor,
            strokeColor: appearance.color,
            strokeWidth: Math.max(1, appearance.weight * 0.65),
            radius: appearance.pointRadius,
          }}
          size={56}
        />
      </div>

      <label className="si-sym-field">
        <span className="si-sym-field__label">Search symbols</span>
        <input
          className="si-sym-input"
          type="search"
          placeholder="Filter gallery…"
          value={gallerySearch}
          onChange={e => setGallerySearch(e.target.value)}
        />
      </label>

      <div className="si-sym-point-cats" role="tablist" aria-label="Symbol categories">
        {SI_POINT_SYMBOL_CATEGORIES.map(cat => (
          <button
            key={cat}
            type="button"
            role="tab"
            className={`si-sym-point-cat${galleryCategory === cat ? ' si-sym-point-cat--active' : ''}`}
            onClick={() => setGalleryCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="si-sym-point-gallery">
        {filteredGallery.map(item => (
          <button
            key={item.id}
            type="button"
            className={`si-sym-point-gallery__item${selectedGalleryId === item.id ? ' si-sym-point-gallery__item--active' : ''}`}
            title={item.label}
            onClick={() => {
              onGallerySelect?.(item);
              onAppearanceChange({
                fillColor: item.fillColor,
                color: item.strokeColor,
                pointRadius: item.radius,
              });
            }}
          >
            <GalleryShapeSvg item={item} active={selectedGalleryId === item.id} />
            <span>{item.label}</span>
          </button>
        ))}
        {!filteredGallery.length ? <p className="si-sym-muted">No symbols match your search.</p> : null}
      </div>

      <div className="si-sym-grid">
        <label className="si-sym-field">
          <span className="si-sym-field__label">Fill</span>
          <input
            className="si-sym-color"
            type="color"
            value={appearance.fillColor.startsWith('#') ? appearance.fillColor : '#22c55e'}
            onChange={e => onAppearanceChange({ fillColor: e.target.value })}
          />
        </label>
        <label className="si-sym-field">
          <span className="si-sym-field__label">Outline</span>
          <input
            className="si-sym-color"
            type="color"
            value={appearance.color.startsWith('#') ? appearance.color : '#15803d'}
            onChange={e => onAppearanceChange({ color: e.target.value })}
          />
        </label>
        <label className="si-sym-field">
          <span className="si-sym-field__label">Size ({appearance.pointRadius}px)</span>
          <input
            className="si-sym-range"
            type="range"
            min={3}
            max={24}
            value={appearance.pointRadius}
            onChange={e => onAppearanceChange({ pointRadius: Number(e.target.value) })}
          />
        </label>
        <label className="si-sym-field">
          <span className="si-sym-field__label">Outline width ({appearance.weight.toFixed(1)}px)</span>
          <input
            className="si-sym-range"
            type="range"
            min={5}
            max={80}
            value={Math.round(appearance.weight * 10)}
            onChange={e => onAppearanceChange({ weight: Number(e.target.value) / 10 })}
          />
        </label>
      </div>
    </>
  );
}

export type { ArcgisLayerDefLite };
