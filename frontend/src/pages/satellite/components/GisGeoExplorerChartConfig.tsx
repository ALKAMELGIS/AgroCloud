import type { GisChartPanelConfig, GisChartLayoutMode, GisChartSortMode, GisChartVizMode } from '../../../lib/gisMapChartPanelConfig'

type Props = {
  config: GisChartPanelConfig
  onChange: (next: GisChartPanelConfig) => void
  onOpenCharts?: () => void
}

export function GisGeoExplorerChartConfig({ config, onChange, onOpenCharts }: Props) {
  const set = (patch: Partial<GisChartPanelConfig>) => onChange({ ...config, ...patch })

  return (
    <details className="gis-geo-explorer-chart-config">
      <summary className="gis-geo-explorer-chart-config__summary">
        <span className="gis-geo-explorer-chart-config__summary-inner">
          <i className="fa-solid fa-sliders" aria-hidden />
          Configure chart
        </span>
        <i className="fa-solid fa-chevron-down gis-geo-explorer-chart-config__chev" aria-hidden />
      </summary>
      <div className="gis-geo-explorer-chart-config__body">
        <p className="gis-geo-explorer-chart-config__hint">
          Controls how the <strong>Charts</strong> panel shows the layer feature-count summary. Saved in this browser.
        </p>
        <label className="gis-geo-explorer-chart-config__field">
          <span>Chart type</span>
          <select
            value={config.viz}
            onChange={e => set({ viz: e.target.value as GisChartVizMode })}
            aria-label="Chart type"
          >
            <option value="bars">Bar chart (per layer)</option>
            <option value="donut">Proportion (donut)</option>
          </select>
        </label>
        <label className={`gis-geo-explorer-chart-config__field${config.viz === 'donut' ? ' is-disabled' : ''}`}>
          <span>Bar direction</span>
          <select
            value={config.layout}
            disabled={config.viz === 'donut'}
            onChange={e => set({ layout: e.target.value as GisChartLayoutMode })}
            aria-label="Bar direction"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </label>
        <label className="gis-geo-explorer-chart-config__field">
          <span>Sort layers by</span>
          <select
            value={config.sort}
            onChange={e => set({ sort: e.target.value as GisChartSortMode })}
            aria-label="Sort layers by"
          >
            <option value="countDesc">Feature count (high → low)</option>
            <option value="countAsc">Feature count (low → high)</option>
            <option value="name">Layer name (A–Z)</option>
          </select>
        </label>
        {onOpenCharts ? (
          <button type="button" className="gis-geo-explorer-chart-config__open" onClick={onOpenCharts}>
            <i className="fa-solid fa-chart-simple" aria-hidden />
            Open Charts panel
          </button>
        ) : null}
      </div>
    </details>
  )
}
