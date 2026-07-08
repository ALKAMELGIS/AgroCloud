import { useCallback, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  type ChartOptions,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  LineController,
  BarController,
  PieController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Bar, Line, Pie, Scatter } from 'react-chartjs-2';
import { appAlert } from '../../../lib/appDialog';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  LineController,
  BarController,
  PieController,
  ScatterController,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
);

export type AoiStaticExportLngLat = { lng: number; lat: number };

export type AoiStaticMultiLayerLineChartDataset = {
  id: string;
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  yAxisID: string;
};

export type AoiStaticMultiLayerLineChartProps = {
  title: string;
  labels: string[];
  datasets: AoiStaticMultiLayerLineChartDataset[];
  /** When true, show right axis for land-surface temperature. */
  hasLst: boolean;
  /** When true, show ET (mm/day) axis. */
  hasEt?: boolean;
  /** One WGS84 point per timeline row for CSV export (inside AOI when provided). */
  exportLngLatPerRow?: AoiStaticExportLngLat[];
  /** Tighter layout for floating dashboard cards — external title, legend below chart. */
  compact?: boolean;
};

type StaticChartType = 'line' | 'bar' | 'scatter' | 'pie';

function meanFinite(values: number[]): number {
  const xs = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!xs.length) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function legendToggleHandler(
  _evt: unknown,
  legendItem: { datasetIndex?: number; index?: number },
  legend: { chart?: ChartJS },
) {
  const chart = legend.chart;
  if (!chart) return;
  const t = String((chart.config as { type?: string }).type ?? '');
  if (t === 'pie' || t === 'doughnut') {
    const i = legendItem.index;
    if (i == null) return;
    chart.toggleDataVisibility(i);
    chart.update();
    return;
  }
  const ds = legendItem.datasetIndex;
  if (ds == null) return;
  const vis = chart.isDatasetVisible(ds);
  chart.setDatasetVisibility(ds, !vis);
  chart.update();
}

export function AoiStaticMultiLayerLineChart({
  title,
  labels,
  datasets,
  hasLst,
  hasEt = false,
  exportLngLatPerRow,
  compact = false,
}: AoiStaticMultiLayerLineChartProps) {
  const [chartTheme, setChartTheme] = useState<'dark' | 'light'>('light');
  const [chartType, setChartType] = useState<StaticChartType>('line');
  const isLight = chartTheme === 'light';
  const titleColor = isLight ? '#0f172a' : '#e2e8f0';
  const labelColor = isLight ? '#334155' : '#cbd5e1';
  const tickColor = isLight ? '#475569' : '#94a3b8';
  const gridColor = isLight ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.14)';

  const zoomCfg =
    chartType === 'line'
      ? {
          limits: { x: { minRange: 2 } },
          pan: { enabled: true, mode: 'x' as const },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x' as const,
          },
        }
      : {
          pan: { enabled: false },
          zoom: { wheel: { enabled: false }, pinch: { enabled: false }, mode: 'x' as const },
        };

  const lineBarData = useMemo(
    () => ({
      labels,
      datasets: datasets.map(ds => ({
        ...ds,
        fill: false,
        tension: 0.32,
        pointRadius: chartType === 'line' ? 3 : 0,
        pointHoverRadius: chartType === 'line' ? 6 : 0,
        borderWidth: 2,
        spanGaps: true,
      })),
    }),
    [labels, datasets, chartType],
  );

  const pieData = useMemo(
    () => ({
      labels: datasets.map(ds => ds.label),
      datasets: [
        {
          data: datasets.map(ds => {
            const m = meanFinite(ds.data);
            return Number.isFinite(m) ? m : 0;
          }),
          backgroundColor: datasets.map(ds => ds.backgroundColor),
          borderColor: datasets.map(ds => ds.borderColor),
          borderWidth: 1,
        },
      ],
    }),
    [datasets],
  );

  const scatterData = useMemo(
    () => ({
      datasets: datasets.map(ds => ({
        label: ds.label,
        data: labels.map((_, i) => {
          const y = ds.data[i];
          return { x: i, y: Number.isFinite(y) ? y : NaN };
        }),
        borderColor: ds.borderColor,
        backgroundColor: ds.backgroundColor,
        yAxisID: ds.yAxisID,
        pointRadius: 4,
        pointHoverRadius: 7,
      })),
    }),
    [labels, datasets],
  );

  const cartesianOptions = useMemo(() => {
    const base = {
      responsive: true,
      maintainAspectRatio: false,
      layout: compact ? { padding: { top: 2, bottom: 2, left: 0, right: 0 } } : undefined,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        title: {
          display: !compact,
          text: title,
          color: titleColor,
          font: { size: compact ? 10 : 13, weight: 600 },
          padding: { bottom: compact ? 4 : 8 },
        },
        legend: {
          position: (compact ? 'bottom' : 'top') as 'bottom' | 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: compact ? 8 : 12,
            padding: compact ? 6 : 14,
            color: labelColor,
            font: { size: compact ? 9 : 11, weight: 600 },
          },
          onClick: legendToggleHandler,
        },
        tooltip: {
          mode: 'index' as const,
          intersect: false,
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.92)',
          titleColor: isLight ? '#0f172a' : '#f1f5f9',
          bodyColor: isLight ? '#1e293b' : '#e2e8f0',
          borderColor: isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.35)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label(ctx: { dataset: { label?: string }; parsed: { y: number | null } }) {
              const y = ctx.parsed.y;
              if (y == null || Number.isNaN(y)) return `${ctx.dataset.label ?? ''}: —`;
              return `${ctx.dataset.label ?? ''}: ${y}`;
            },
          },
        },
        zoom: zoomCfg,
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            maxRotation: compact ? 32 : 40,
            minRotation: 0,
            font: { size: compact ? 8 : 10 },
          },
        },
        yIndex: {
          type: 'linear' as const,
          position: 'left' as const,
          display: datasets.some(d => d.yAxisID === 'yIndex'),
          stacked: false,
          title: {
            display: true,
            text: compact ? 'Index (−1…1)' : 'Spectral index (−1 … 1)',
            color: labelColor,
            font: { size: compact ? 9 : 11, weight: 600 },
          },
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: compact ? 8 : 11 } },
          suggestedMin: -1,
          suggestedMax: 1,
        },
        yLST: {
          type: 'linear' as const,
          position: 'right' as const,
          display: hasLst && datasets.some(d => d.yAxisID === 'yLST'),
          title: {
            display: true,
            text: 'LST (°C)',
            color: labelColor,
            font: { size: compact ? 9 : 11, weight: 600 },
          },
          grid: { drawOnChartArea: false },
          ticks: { color: tickColor, font: { size: compact ? 8 : 11 } },
        },
        yET: {
          type: 'linear' as const,
          position: 'right' as const,
          display: hasEt && datasets.some(d => d.yAxisID === 'yET'),
          offset: hasLst,
          title: {
            display: true,
            text: 'ET (mm/day)',
            color: labelColor,
            font: { size: compact ? 9 : 11, weight: 600 },
          },
          grid: { drawOnChartArea: false },
          ticks: { color: tickColor, font: { size: compact ? 8 : 11 } },
          suggestedMin: 0,
          suggestedMax: 10,
        },
      },
    };
    return base;
  }, [title, datasets, hasLst, hasEt, titleColor, labelColor, tickColor, gridColor, isLight, zoomCfg, compact]);

  const lineOptions = useMemo(() => cartesianOptions as ChartOptions<'line'>, [cartesianOptions]);

  const barOptions = useMemo(() => cartesianOptions as ChartOptions<'bar'>, [cartesianOptions]);

  const scatterOptions = useMemo(() => {
    const xMax = Math.max(labels.length - 1, 0);
    const tt = cartesianOptions.plugins?.tooltip;
    return {
      ...cartesianOptions,
      interaction: { mode: 'nearest' as const, intersect: false },
      scales: {
        ...cartesianOptions.scales,
        x: {
          type: 'linear' as const,
          min: -0.35,
          max: xMax + 0.35,
          grid: { color: gridColor },
          title: {
            display: true,
            text: 'Week',
            color: labelColor,
            font: { size: 11, weight: 600 },
          },
          ticks: {
            color: tickColor,
            maxTicksLimit: 10,
            callback(tickValue: string | number) {
              const idx = Math.round(Number(tickValue));
              if (idx >= 0 && idx < labels.length) return labels[idx];
              return '';
            },
          },
        },
      },
      plugins: {
        ...cartesianOptions.plugins,
        tooltip: {
          ...tt,
          mode: 'nearest' as const,
          intersect: false,
          callbacks: {
            ...tt?.callbacks,
            label(ctx: { dataset: { label?: string }; parsed: { x?: number; y: number | null } }) {
              const i = Math.round(Number(ctx.parsed.x ?? NaN));
              const date = i >= 0 && i < labels.length ? labels[i] : '';
              const y = ctx.parsed.y;
              if (y == null || Number.isNaN(y)) return `${ctx.dataset.label ?? ''}${date ? ` (${date})` : ''}: —`;
              return `${ctx.dataset.label ?? ''}${date ? ` (${date})` : ''}: ${y}`;
            },
          },
        },
      },
    } as ChartOptions<'scatter'>;
  }, [cartesianOptions, labels, gridColor, labelColor, tickColor]);

  const pieOptions = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: `${title} · mean over AOI weeks`,
            color: titleColor,
            font: { size: 12, weight: 600 },
            padding: { bottom: 8 },
          },
          legend: {
            position: 'right' as const,
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 10,
              color: labelColor,
              font: { size: 11, weight: 600 },
            },
            onClick: legendToggleHandler,
          },
          tooltip: {
            backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.92)',
            titleColor: isLight ? '#0f172a' : '#f1f5f9',
            bodyColor: isLight ? '#1e293b' : '#e2e8f0',
            borderColor: isLight ? 'rgba(148, 163, 184, 0.45)' : 'rgba(148, 163, 184, 0.35)',
            borderWidth: 1,
            padding: 10,
          },
          zoom: zoomCfg,
        },
      }) as ChartOptions<'pie'>,
    [title, titleColor, labelColor, isLight, zoomCfg],
  );

  const exportChartToExcel = useCallback(() => {
    const escapeCsv = (value: string | number) => {
      const raw = String(value ?? '');
      if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
      return raw;
    };

    const header = ['Date', 'Longitude', 'Latitude', ...datasets.map(ds => ds.label)];
    const lines = [header.map(escapeCsv).join(',')];
    for (let i = 0; i < labels.length; i++) {
      const row: string[] = [labels[i] ?? ''];
      const pt = exportLngLatPerRow?.[i];
      row.push(pt != null && Number.isFinite(pt.lng) ? Number(pt.lng).toFixed(6) : '');
      row.push(pt != null && Number.isFinite(pt.lat) ? Number(pt.lat).toFixed(6) : '');
      for (const ds of datasets) {
        const v = ds.data[i];
        row.push(Number.isFinite(v) ? Number(v).toFixed(4) : '');
      }
      lines.push(row.map(escapeCsv).join(','));
    }

    const csv = lines.join('\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aoi-chart-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [labels, datasets, exportLngLatPerRow]);

  const onGenerateReport = useCallback(() => {
    void appAlert(
      'Report generation is not connected to a backend yet. Use CSV export to download the timeline with Longitude and Latitude for each row.',
      { title: 'Generate report' },
    );
  }, []);

  if (!labels.length || !datasets.length) {
    return (
      <div className="si-aoi-static-line-empty">
        <p className="si-aoi-static-line-empty-title">No timeline yet</p>
        <p className="si-aoi-static-line-empty-hint">
          Draw an AOI, pick layers below, then use <strong>Generate timeline</strong> in Remote Sensing to load weeks on
          the X-axis.
        </p>
      </div>
    );
  }

  const chartKey = `${chartType}-${isLight ? 'light' : 'dark'}`;

  return (
    <div
      className={[
        'si-aoi-static-line-wrap',
        isLight ? 'si-aoi-static-line-wrap--light' : 'si-aoi-static-line-wrap--dark',
        compact ? 'si-aoi-static-line-wrap--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="si-aoi-static-line-toolbar">
        <div className="si-aoi-static-chart-type" role="group" aria-label="Chart type">
          <span className="si-aoi-static-chart-type-label">Chart type</span>
          <div className="si-aoi-static-chart-type-icons">
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon${chartType === 'line' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Line chart"
              aria-pressed={chartType === 'line'}
              title="Line"
              onClick={() => setChartType('line')}
            >
              <i className="fa-solid fa-chart-line" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon${chartType === 'bar' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Bar chart"
              aria-pressed={chartType === 'bar'}
              title="Bar"
              onClick={() => setChartType('bar')}
            >
              <i className="fa-solid fa-chart-column" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon${chartType === 'pie' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Pie chart"
              aria-pressed={chartType === 'pie'}
              title="Pie"
              onClick={() => setChartType('pie')}
            >
              <i className="fa-solid fa-chart-pie" aria-hidden />
            </button>
            <button
              type="button"
              className={`si-aoi-static-chart-type-icon${chartType === 'scatter' ? ' si-aoi-static-chart-type-icon--active' : ''}`}
              aria-label="Scatter plot"
              aria-pressed={chartType === 'scatter'}
              title="Scatter"
              onClick={() => setChartType('scatter')}
            >
              <i className="fa-solid fa-braille" aria-hidden />
            </button>
          </div>
        </div>
        <div className="si-aoi-static-line-actions">
          <button
            type="button"
            className="si-aoi-static-line-theme-toggle"
            aria-label={isLight ? 'Switch chart to dark theme' : 'Switch chart to light theme'}
            title={isLight ? 'Dark chart theme' : 'Light chart theme'}
            onClick={() => setChartTheme(prev => (prev === 'light' ? 'dark' : 'light'))}
          >
            <i className={`fa-solid ${isLight ? 'fa-moon' : 'fa-sun'}`} aria-hidden />
          </button>
          <button
            type="button"
            className="si-aoi-static-line-theme-toggle"
            aria-label="Generate report"
            title="Generate report"
            onClick={onGenerateReport}
          >
            <i className="fa-solid fa-file-lines" aria-hidden />
          </button>
          <button
            type="button"
            className="si-aoi-static-line-theme-toggle"
            aria-label="Export chart to Excel"
            title="Export chart to Excel (.csv)"
            onClick={exportChartToExcel}
          >
            <i className="fa-regular fa-file-excel" aria-hidden />
          </button>
        </div>
      </div>
      {compact ? <div className="si-aoi-static-line-chart-title">{title}</div> : null}
      <div className="si-aoi-static-line-chart-host">
        {chartType === 'line' ? (
          <Line key={chartKey} data={lineBarData} options={lineOptions} />
        ) : chartType === 'bar' ? (
          <Bar key={chartKey} data={lineBarData} options={barOptions} />
        ) : chartType === 'scatter' ? (
          <Scatter key={chartKey} data={scatterData} options={scatterOptions} />
        ) : (
          <Pie key={chartKey} data={pieData} options={pieOptions} />
        )}
      </div>
    </div>
  );
}
