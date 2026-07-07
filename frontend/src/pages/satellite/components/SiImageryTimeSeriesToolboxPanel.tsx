import type { RemoteSensingLayerSelectGroup } from '../../../lib/agroCompositeIndices';
import type { LayerLiveStatsLayerId } from '../utils/staticAoiMultiChartData';
import {
  AoiStaticMultiLayerLineChart,
  type AoiStaticExportLngLat,
  type AoiStaticMultiLayerLineChartDataset,
} from './AoiStaticMultiLayerLineChart';
import { LayerLiveStatsLayerDropdown } from './LayerLiveStatsLayerDropdown';
import './SiImageryTimeSeriesToolboxPanel.css';

export type SiImageryTimeSeriesToolboxPanelProps = {
  hasAoi: boolean;
  indexLabel: string;
  timeSeriesStart: string;
  timeSeriesEnd: string;
  onTimeSeriesStartChange: (iso: string) => void;
  onTimeSeriesEndChange: (iso: string) => void;
  fieldTimelineActive: boolean;
  onTimelinePrimaryClick: () => void;
  fieldAnalysisStatus?: string;
  staticChartsOpen: boolean;
  onToggleStaticCharts: () => void;
  layerLiveStatsLayerGroups: RemoteSensingLayerSelectGroup[];
  layerLiveStatsLayers: LayerLiveStatsLayerId[];
  onLayerLiveStatsLayersChange: (ids: LayerLiveStatsLayerId[]) => void;
  primaryLayerId?: string;
  staticMultiLineLabels: string[];
  staticMultiLineDatasets: AoiStaticMultiLayerLineChartDataset[];
  staticMultiLineHasLst: boolean;
  staticChartExportLngLatPerRow?: AoiStaticExportLngLat[];
};

export function SiImageryTimeSeriesToolboxPanel(props: SiImageryTimeSeriesToolboxPanelProps) {
  const {
    hasAoi,
    indexLabel,
    timeSeriesStart,
    timeSeriesEnd,
    onTimeSeriesStartChange,
    onTimeSeriesEndChange,
    fieldTimelineActive,
    onTimelinePrimaryClick,
    fieldAnalysisStatus,
    staticChartsOpen,
    onToggleStaticCharts,
    layerLiveStatsLayerGroups,
    layerLiveStatsLayers,
    onLayerLiveStatsLayersChange,
    primaryLayerId,
    staticMultiLineLabels,
    staticMultiLineDatasets,
    staticMultiLineHasLst,
    staticChartExportLngLatPerRow,
  } = props;

  const hasChartData = staticMultiLineLabels.length > 0 && staticMultiLineDatasets.length > 0;

  return (
    <div className="si-its-toolbox" dir="auto">
      <p className="si-its-toolbox__lead">
        Multi-layer spectral timeline for the committed AOI. Draw or select an area on the map, pick a date
        range, then generate the timeline — the bottom playback bar and floating chart stay in sync with the
        map canvas.
      </p>

      {!hasAoi ? (
        <p className="si-its-toolbox__warn">
          <i className="fa-solid fa-draw-polygon" aria-hidden /> Draw an AOI on the map to enable live
          statistics.
        </p>
      ) : null}

      <div className="si-its-toolbox__dates">
        <label className="si-its-toolbox__field">
          <span className="si-its-toolbox__label">Series start</span>
          <input
            type="date"
            value={timeSeriesStart}
            onChange={e => onTimeSeriesStartChange(e.target.value)}
            aria-label="Time series start"
          />
        </label>
        <label className="si-its-toolbox__field">
          <span className="si-its-toolbox__label">Series end</span>
          <input
            type="date"
            value={timeSeriesEnd}
            onChange={e => onTimeSeriesEndChange(e.target.value)}
            aria-label="Time series end"
          />
        </label>
      </div>

      <LayerLiveStatsLayerDropdown
        groups={layerLiveStatsLayerGroups}
        selectedIds={layerLiveStatsLayers}
        onSelectedIdsChange={onLayerLiveStatsLayersChange}
        primaryLayerId={primaryLayerId}
        aria-label="Imagery time series layers"
      />

      <div className="si-its-toolbox__actions">
        <button
          type="button"
          className={
            'si-its-toolbox__cta' + (fieldTimelineActive ? ' si-its-toolbox__cta--stop' : '')
          }
          onClick={onTimelinePrimaryClick}
          disabled={!hasAoi}
          aria-label={
            fieldTimelineActive
              ? 'Stop timeline playback'
              : 'Generate weekly timeline from selected date range'
          }
        >
          <i
            className={fieldTimelineActive ? 'fa-solid fa-stop' : 'fa-solid fa-chart-line'}
            aria-hidden
          />
          {fieldTimelineActive ? 'Stop timeline' : 'Generate timeline'}
        </button>
        <button
          type="button"
          className={'si-its-toolbox__map-btn' + (staticChartsOpen ? ' si-its-toolbox__map-btn--on' : '')}
          title={staticChartsOpen ? 'Hide floating chart on map' : 'Show floating chart on map'}
          aria-pressed={staticChartsOpen}
          onClick={onToggleStaticCharts}
        >
          <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
          <span>{staticChartsOpen ? 'Hide map chart' : 'Show on map'}</span>
        </button>
      </div>

      {fieldAnalysisStatus ? <p className="si-its-toolbox__status">{fieldAnalysisStatus}</p> : null}

      {hasChartData ? (
        <div className="si-its-toolbox__chart">
          <p className="si-its-toolbox__chart-kicker">
            {indexLabel} · AOI mean by week · click timeline chips on the map to scrub imagery dates
          </p>
          <AoiStaticMultiLayerLineChart
            title="Raster mean in AOI by week"
            labels={staticMultiLineLabels}
            datasets={staticMultiLineDatasets}
            hasLst={staticMultiLineHasLst}
            exportLngLatPerRow={staticChartExportLngLatPerRow}
            compact
          />
        </div>
      ) : (
        <p className="si-its-toolbox__muted">
          Generate a timeline to populate charts. Layer changes update the map overlay when the chart is
          visible.
        </p>
      )}
    </div>
  );
}
