import { LayerLiveLegendPanel } from '@/modules/remote-sensing/indices/LayerLiveLegendPanel'
import type { SiMapSwipeChromeModel } from './useSiMapSwipeState'
import './SiMapSwipeControl.css'

export type SiMapSwipeChromeProps = SiMapSwipeChromeModel & {
  aoiGeometry?: GeoJSON.Geometry | GeoJSON.Feature | null
}

export function SiMapSwipeChrome({ aoiGeometry = null, ...model }: SiMapSwipeChromeProps) {
  const {
    rootRef,
    open,
    hasAoi,
    setOpen,
    mode,
    setMode,
    split,
    dragging,
    beforeCfg,
    afterCfg,
    beforeTiles,
    afterTiles,
    layerSelectOptions,
    showDateFields,
    showLayerFields,
    beforeLayer,
    setBeforeLayer,
    afterLayer,
    setAfterLayer,
    beforeDate,
    setBeforeDate,
    afterDate,
    setAfterDate,
    legendBeforeOpen,
    setLegendBeforeOpen,
    legendAfterOpen,
    setLegendAfterOpen,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onSplitKey,
  } = model

  if (!open || !hasAoi) return null

  return (
    <div className="si-map-swipe-overlay" ref={rootRef} role="dialog" aria-label="Map swipe compare">
      <div className="si-map-swipe-overlay__maps">
        <div
          className={`si-map-swipe-overlay__handle${dragging ? ' is-dragging' : ''}`}
          style={{ left: `${split}%` }}
          role="slider"
          aria-valuemin={5}
          aria-valuemax={95}
          aria-valuenow={Math.round(split)}
          aria-label="Swipe position"
          tabIndex={0}
          data-map-overlay-isolate=""
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') onSplitKey('ArrowLeft')
            if (e.key === 'ArrowRight') onSplitKey('ArrowRight')
          }}
        >
          <span className="si-map-swipe-overlay__handle-line" aria-hidden />
          <span className="si-map-swipe-overlay__handle-knob" aria-hidden />
        </div>
      </div>

      <div
        className="si-map-swipe-overlay__legend-slot si-map-swipe-overlay__legend-slot--before"
        style={{ width: `${split}%` }}
        data-map-overlay-isolate=""
      >
        <button
          type="button"
          className={`si-map-swipe-overlay__legend-fab${legendBeforeOpen ? ' is-on' : ''}`}
          aria-pressed={legendBeforeOpen}
          aria-label={legendBeforeOpen ? 'Hide Before color key' : 'Show Before color key'}
          title={legendBeforeOpen ? 'Hide Before legend' : 'Before legend'}
          onClick={() => setLegendBeforeOpen(v => !v)}
        >
          <i className="fa-solid fa-palette" aria-hidden />
        </button>
        {legendBeforeOpen ? (
          <div className="si-map-swipe-overlay__legend-card" role="dialog" aria-label="Before color key">
            <div className="si-map-swipe-overlay__legend-card-head">
              <span>
                Before
                <em>
                  {beforeCfg.layerId}
                  {beforeCfg.sceneDate ? ` · ${beforeCfg.sceneDate}` : ''}
                </em>
              </span>
              <button type="button" aria-label="Close Before legend" onClick={() => setLegendBeforeOpen(false)}>
                ✕
              </button>
            </div>
            <div className="si-map-swipe-overlay__legend-card-body">
              <LayerLiveLegendPanel
                key={`swipe-legend-before-${beforeCfg.layerId}-${beforeCfg.sceneDate}`}
                layerOptions={layerSelectOptions}
                activeLayerId={beforeCfg.layerId}
                sceneDate={beforeCfg.sceneDate}
                aoiGeometry={aoiGeometry}
                activeOnly
              />
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="si-map-swipe-overlay__legend-slot si-map-swipe-overlay__legend-slot--after"
        style={{ width: `${100 - split}%` }}
        data-map-overlay-isolate=""
      >
        <button
          type="button"
          className={`si-map-swipe-overlay__legend-fab${legendAfterOpen ? ' is-on' : ''}`}
          aria-pressed={legendAfterOpen}
          aria-label={legendAfterOpen ? 'Hide After color key' : 'Show After color key'}
          title={legendAfterOpen ? 'Hide After legend' : 'After legend'}
          onClick={() => setLegendAfterOpen(v => !v)}
        >
          <i className="fa-solid fa-palette" aria-hidden />
        </button>
        {legendAfterOpen ? (
          <div className="si-map-swipe-overlay__legend-card" role="dialog" aria-label="After color key">
            <div className="si-map-swipe-overlay__legend-card-head">
              <span>
                After
                <em>
                  {afterCfg.layerId}
                  {afterCfg.sceneDate ? ` · ${afterCfg.sceneDate}` : ''}
                </em>
              </span>
              <button type="button" aria-label="Close After legend" onClick={() => setLegendAfterOpen(false)}>
                ✕
              </button>
            </div>
            <div className="si-map-swipe-overlay__legend-card-body">
              <LayerLiveLegendPanel
                key={`swipe-legend-after-${afterCfg.layerId}-${afterCfg.sceneDate}`}
                layerOptions={layerSelectOptions}
                activeLayerId={afterCfg.layerId}
                sceneDate={afterCfg.sceneDate}
                aoiGeometry={aoiGeometry}
                activeOnly
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="si-map-swipe-panel" data-map-overlay-isolate="">
        <div className="si-map-swipe-panel__row">
          <div className="si-map-swipe-panel__seg" role="group" aria-label="Compare mode">
            <button type="button" className={mode === 'both' ? 'is-on' : undefined} onClick={() => setMode('both')}>
              Both
            </button>
            <button type="button" className={mode === 'dates' ? 'is-on' : undefined} onClick={() => setMode('dates')}>
              Dates
            </button>
            <button
              type="button"
              className={mode === 'layers' ? 'is-on' : undefined}
              onClick={() => setMode('layers')}
            >
              Layers
            </button>
          </div>
          <div className="si-map-swipe-panel__actions">
            <button
              type="button"
              className="si-map-swipe-panel__close"
              aria-label="Close MapSwipe"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>

        <div className={`si-map-swipe-panel__grid${mode === 'both' ? ' is-both' : ''}`}>
          {showLayerFields ? (
            <>
              <label>
                <span>Before layer</span>
                <select value={beforeLayer} onChange={e => setBeforeLayer(e.target.value)}>
                  {layerSelectOptions.map(o => (
                    <option key={`b-lyr-${o.id}`} value={o.id}>
                      {o.label || o.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>After layer</span>
                <select value={afterLayer} onChange={e => setAfterLayer(e.target.value)}>
                  {layerSelectOptions.map(o => (
                    <option key={`a-lyr-${o.id}`} value={o.id}>
                      {o.label || o.id}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {showDateFields ? (
            <>
              <label>
                <span>Before date</span>
                <input type="date" value={beforeDate} onChange={e => setBeforeDate(e.target.value)} />
              </label>
              <label>
                <span>After date</span>
                <input type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} />
              </label>
            </>
          ) : null}
        </div>

        {!beforeTiles.length || !afterTiles.length ? (
          <p className="si-map-swipe-panel__hint" role="status">
            Waiting for WMS tiles… check AOI, date, and layer.
          </p>
        ) : null}
      </div>
    </div>
  )
}
