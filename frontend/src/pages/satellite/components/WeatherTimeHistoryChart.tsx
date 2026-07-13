import React, { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  metricLabel,
  metricUnit,
  metricValueFromHourly,
  type OpenMeteoHourlyPoint,
  type WeatherHistoryMetric,
} from '../../../lib/openMeteoWeather';
import {
  buildWeatherDailySeries,
  buildWeatherHistoryChartSeries,
  type WeatherTimeAggregation,
} from '../lib/weatherHistoryChartAggregate';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
);

type WeatherTimeHistoryChartProps = {
  points: OpenMeteoHourlyPoint[];
  metric: WeatherHistoryMetric;
  timezone: string;
  startDate: string;
  endDate: string;
  minDate?: string;
  maxDate?: string;
  onRangeChange: (start: string, end: string) => void;
  onExport?: () => void;
  exportLoading?: boolean;
  exportProgressLabel?: string;
};

type ChartVisual =
  | 'bar'
  | 'line'
  | 'pie'
  | 'donut'
  | 'area'
  | 'scatter'
  | 'heatmap'
  | 'radar'
  | 'boxplot'
  | 'treemap';

type ChartVisualDef = {
  id: ChartVisual;
  icon: string;
  title: string;
  primary?: boolean;
};

type XAxisLabel = {
  pct: number;
  line1: string;
  line2: string;
  align: 'start' | 'center' | 'end';
};

type PlotCoord = { x: number; y: number; v: number };
type DailyBucket = { date: string; label: string; value: number };
type PieSlice = { d: string; color: string; key: string };
type HeatCell = { x: number; y: number; w: number; h: number; opacity: number; key: string };
type TreemapCell = { x: number; y: number; w: number; h: number; color: string; key: string };

const CHART_VISUALS: ChartVisualDef[] = [
  { id: 'bar', icon: 'fa-chart-column', title: 'Bar chart', primary: true },
  { id: 'line', icon: 'fa-chart-line', title: 'Line chart', primary: true },
  { id: 'pie', icon: 'fa-chart-pie', title: 'Pie chart', primary: true },
  { id: 'donut', icon: 'fa-circle-notch', title: 'Donut chart' },
  { id: 'area', icon: 'fa-chart-area', title: 'Area chart' },
  { id: 'scatter', icon: 'fa-braille', title: 'Scatter chart' },
  { id: 'heatmap', icon: 'fa-table-cells', title: 'Heat map' },
  { id: 'radar', icon: 'fa-bullseye', title: 'Radar chart' },
  { id: 'boxplot', icon: 'fa-box', title: 'Box plot' },
  { id: 'treemap', icon: 'fa-sitemap', title: 'Treemap' },
];

const PRIMARY_CHART_VISUALS = CHART_VISUALS.filter(v => v.primary);
const MORE_CHART_VISUALS = CHART_VISUALS.filter(v => !v.primary);
const TIME_AXIS_CHARTS = new Set<ChartVisual>(['line', 'bar', 'area', 'scatter', 'heatmap', 'treemap']);
const CARTESIAN_CHART_JS = new Set<ChartVisual>(['line', 'bar', 'area']);
const WEATHER_AGGREGATE_OPTIONS: Array<{ value: WeatherTimeAggregation; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const WIND_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Normalized position in range → [0, 1] */
function valueToT(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** Single-hue luxury gradient — emerald glass (Bar & Pie) */
function luxuryMonoFill(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const light = 38 + u * 34;
  const alpha = 0.28 + u * 0.62;
  return `hsla(158, 48%, ${light.toFixed(1)}%, ${alpha.toFixed(2)})`;
}

/** Wind rose — single blue-white gradient */
function luxuryWindFill(t: number): string {
  const u = Math.max(0, Math.min(1, t));
  const light = 42 + u * 32;
  const alpha = 0.26 + u * 0.58;
  return `hsla(210, 42%, ${light.toFixed(1)}%, ${alpha.toFixed(2)})`;
}

type WindRoseBin = {
  dir: string;
  degCenter: number;
  value: number;
  count: number;
};

function buildWindRoseBins(points: OpenMeteoHourlyPoint[]): WindRoseBin[] {
  const acc = WIND_DIRS.map((dir, i) => ({ dir, degCenter: i * 45, speeds: [] as number[] }));
  points.forEach(p => {
    if (p.windDirectionDeg == null || !Number.isFinite(p.windDirectionDeg)) return;
    if (p.windSpeedKmh == null || !Number.isFinite(p.windSpeedKmh)) return;
    const idx = Math.round(p.windDirectionDeg / 45) % 8;
    acc[idx].speeds.push(p.windSpeedKmh);
  });
  return acc.map(b => ({
    dir: b.dir,
    degCenter: b.degCenter,
    count: b.speeds.length,
    value: b.speeds.length ? b.speeds.reduce((sum, v) => sum + v, 0) / b.speeds.length : 0,
  }));
}

function buildValueColoredPieSlices(
  buckets: DailyBucket[],
  min: number,
  max: number,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): PieSlice[] {
  const total = buckets.reduce((sum, b) => sum + Math.max(b.value, 0), 0);
  if (total <= 0) return [];
  let angle = -Math.PI / 2;
  return buckets.map(b => {
    const slice = (Math.max(b.value, 0) / total) * Math.PI * 2;
    const start = angle;
    const end = angle + slice;
    angle = end;
    return {
      key: b.date,
      color: luxuryMonoFill(valueToT(b.value, min, max)),
      d: ringSlicePath(cx, cy, outerR, innerR, start, end),
    };
  });
}

function chartDef(id: ChartVisual): ChartVisualDef {
  return CHART_VISUALS.find(v => v.id === id) ?? CHART_VISUALS[1];
}

function finiteValues(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v != null && Number.isFinite(v));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function spanDaysFromPoints(points: OpenMeteoHourlyPoint[]): number {
  if (points.length < 2) return 1;
  const a = new Date(points[0].time).getTime();
  const b = new Date(points[points.length - 1].time).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 7;
  return Math.max(1, (b - a) / 86_400_000);
}

function formatXAxisLabel(iso: string, tz: string, spanDays: number): { line1: string; line2: string } {
  try {
    const d = new Date(iso);
    const line1 = d.toLocaleDateString(undefined, {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
    });
    if (spanDays <= 3) {
      const line2 = d.toLocaleTimeString(undefined, {
        timeZone: tz,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
      return { line1, line2 };
    }
    if (spanDays <= 10) {
      const line2 = d.toLocaleTimeString(undefined, {
        timeZone: tz,
        hour: 'numeric',
        hour12: true,
      });
      return { line1, line2 };
    }
    return { line1, line2: '' };
  } catch {
    return { line1: iso.slice(5, 10), line2: '' };
  }
}

function buildXAxisLabels(points: OpenMeteoHourlyPoint[], timezone: string): XAxisLabel[] {
  if (!points.length) return [];
  const spanDays = spanDaysFromPoints(points);
  const maxLabels = spanDays <= 3 ? 6 : spanDays <= 10 ? 5 : 4;
  const count = Math.min(maxLabels, points.length);
  const indices: number[] = [];
  if (count === 1) {
    indices.push(0);
  } else {
    for (let i = 0; i < count; i++) {
      indices.push(Math.round((i / (count - 1)) * (points.length - 1)));
    }
  }

  const seen = new Set<number>();
  const uniqueIndices = indices.filter(i => {
    if (seen.has(i)) return false;
    seen.add(i);
    return true;
  });

  return uniqueIndices.map((idx, i, arr) => {
    const pct = (idx / Math.max(points.length - 1, 1)) * 100;
    const { line1, line2 } = formatXAxisLabel(points[idx].time, timezone, spanDays);
    const align: XAxisLabel['align'] =
      i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'center';
    return { pct, line1, line2, align };
  });
}

function buildPlotCoords(
  values: (number | null)[],
  padL: number,
  padT: number,
  innerW: number,
  innerH: number,
  yMin: number,
  ySpan: number,
): PlotCoord[] {
  const out: PlotCoord[] = [];
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    out.push({
      x: padL + (i / Math.max(values.length - 1, 1)) * innerW,
      y: padT + innerH - ((v - yMin) / ySpan) * innerH,
      v,
    });
  });
  return out;
}

function pathFromCoords(coords: PlotCoord[]): string {
  if (!coords.length) return '';
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join('');
}

function dailyAggregates(points: OpenMeteoHourlyPoint[], values: (number | null)[]): DailyBucket[] {
  const map = new Map<string, number[]>();
  points.forEach((p, i) => {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) return;
    const d = p.time.slice(0, 10);
    const bucket = map.get(d) ?? [];
    bucket.push(v);
    map.set(d, bucket);
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({
      date,
      label: date.slice(5),
      value: vals.reduce((sum, n) => sum + n, 0) / vals.length,
    }));
}

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function ringSlicePath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  start: number,
  end: number,
): string {
  const o0 = polar(cx, cy, outerR, start);
  const o1 = polar(cx, cy, outerR, end);
  const i1 = polar(cx, cy, innerR, end);
  const i0 = polar(cx, cy, innerR, start);
  const large = end - start > Math.PI ? 1 : 0;
  if (innerR <= 0) {
    return `M ${cx} ${cy} L ${o0.x.toFixed(1)} ${o0.y.toFixed(1)} A ${outerR} ${outerR} 0 ${large} 1 ${o1.x.toFixed(1)} ${o1.y.toFixed(1)} Z`;
  }
  return [
    `M ${o0.x.toFixed(1)} ${o0.y.toFixed(1)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o1.x.toFixed(1)} ${o1.y.toFixed(1)}`,
    `L ${i1.x.toFixed(1)} ${i1.y.toFixed(1)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i0.x.toFixed(1)} ${i0.y.toFixed(1)}`,
    'Z',
  ].join(' ');
}

function buildPieSlices(
  buckets: DailyBucket[],
  min: number,
  max: number,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): PieSlice[] {
  const total = buckets.reduce((sum, b) => sum + Math.max(b.value, 0), 0);
  if (total <= 0) return [];
  let angle = -Math.PI / 2;
  return buckets.map(b => {
    const slice = (Math.max(b.value, 0) / total) * Math.PI * 2;
    const start = angle;
    const end = angle + slice;
    angle = end;
    return {
      key: b.date,
      color: luxuryMonoFill(valueToT(b.value, min, max)),
      d: ringSlicePath(cx, cy, outerR, innerR, start, end),
    };
  });
}

function buildHeatCells(
  values: number[],
  padL: number,
  padT: number,
  innerW: number,
  innerH: number,
  cols = 14,
  rows = 4,
): HeatCell[] {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const cells: HeatCell[] = [];
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const totalCells = cols * rows;
  values.slice(-totalCells).forEach((v, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({
      key: `h-${i}`,
      x: padL + col * cellW,
      y: padT + row * cellH,
      w: Math.max(1, cellW - 1),
      h: Math.max(1, cellH - 1),
      opacity: 0.22 + ((v - min) / span) * 0.78,
    });
  });
  return cells;
}

function buildTreemapCells(
  buckets: DailyBucket[],
  padL: number,
  padT: number,
  innerW: number,
  innerH: number,
): TreemapCell[] {
  const positive = buckets.filter(b => b.value > 0);
  const total = positive.reduce((sum, b) => sum + b.value, 0);
  if (total <= 0) return [];
  const vals = positive.map(b => b.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  let x = padL;
  return positive.map(b => {
    const w = (b.value / total) * innerW;
    const cell: TreemapCell = {
      key: b.date,
      x,
      y: padT,
      w: Math.max(2, w - 1),
      h: innerH,
      color: luxuryMonoFill(valueToT(b.value, min, max)),
    };
    x += w;
    return cell;
  });
}

function statCardIcon(metric: WeatherHistoryMetric, kind: 'min' | 'avg' | 'max' | 'samples'): string {
  if (kind === 'samples') return 'fa-layer-group';
  if (kind === 'avg') return 'fa-gauge-high';
  switch (metric) {
    case 'temp':
      return kind === 'min' ? 'fa-temperature-arrow-down' : 'fa-temperature-arrow-up';
    case 'rain':
      return kind === 'min' ? 'fa-cloud-rain' : 'fa-cloud-showers-heavy';
    case 'humid':
      return kind === 'min' ? 'fa-droplet' : 'fa-water';
    case 'wind':
      return 'fa-wind';
    case 'press':
      return kind === 'min' ? 'fa-gauge-simple' : 'fa-gauge-high';
    default:
      return kind === 'min' ? 'fa-arrow-down' : 'fa-arrow-up';
  }
}

function ChartTypePicker({
  chartVisual,
  onChange,
}: {
  chartVisual: ChartVisual;
  onChange: (id: ChartVisual) => void;
}) {
  const moreActive = MORE_CHART_VISUALS.some(v => v.id === chartVisual);
  const [expanded, setExpanded] = useState(moreActive);

  useEffect(() => {
    if (moreActive) setExpanded(true);
  }, [moreActive]);

  const renderBtn = (v: ChartVisualDef) => (
    <button
      key={v.id}
      type="button"
      role="tab"
      aria-selected={chartVisual === v.id}
      className={`si-wx-history__viz-btn${chartVisual === v.id ? ' active' : ''}`}
      title={v.title}
      aria-label={v.title}
      onClick={() => onChange(v.id)}
    >
      <i className={`fa-solid ${v.icon}`} aria-hidden />
    </button>
  );

  return (
    <div
      className={`si-wx-history__viz-types${expanded ? ' is-expanded' : ''}`}
      role="tablist"
      aria-label="Chart type"
    >
      {PRIMARY_CHART_VISUALS.map(renderBtn)}
      <div className="si-wx-history__viz-extra" aria-hidden={!expanded}>
        {MORE_CHART_VISUALS.map(renderBtn)}
      </div>
      <button
        type="button"
        className={`si-wx-history__viz-btn si-wx-history__viz-toggle${moreActive && !expanded ? ' has-hidden-active' : ''}${expanded ? ' is-open' : ''}`}
        title={expanded ? 'Collapse chart types' : 'Expand chart types'}
        aria-label={expanded ? 'Collapse chart types' : 'Expand chart types'}
        aria-expanded={expanded}
        onClick={() => setExpanded(open => !open)}
      >
        <i className={`fa-solid ${expanded ? 'fa-angles-right' : 'fa-angles-left'}`} aria-hidden />
      </button>
    </div>
  );
}

export const WeatherTimeHistoryChart: React.FC<WeatherTimeHistoryChartProps> = ({
  points,
  metric,
  timezone,
  startDate,
  endDate,
  minDate,
  maxDate,
  onRangeChange,
  onExport,
  exportLoading = false,
  exportProgressLabel,
}) => {
  const [chartVisual, setChartVisual] = useState<ChartVisual>('line');
  const [timeAggregation, setTimeAggregation] = useState<WeatherTimeAggregation>('day');
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setChartReady(true), 40);
    return () => window.clearTimeout(t);
  }, []);

  const chartSeries = useMemo(
    () => buildWeatherHistoryChartSeries(points, metric, timeAggregation),
    [points, metric, timeAggregation],
  );

  const values = useMemo(() => chartSeries.values, [chartSeries.values]);
  const finite = useMemo(() => finiteValues(values), [values]);
  const dailyBuckets = useMemo(() => {
    const daily = buildWeatherDailySeries(points, metric);
    return daily.map(d => ({
      date: d.date,
      label: d.date.slice(5),
      value: d.value,
    }));
  }, [points, metric]);

  const xAxisLabels = useMemo(() => {
    if (CARTESIAN_CHART_JS.has(chartVisual)) return [];
    return buildXAxisLabels(points, timezone);
  }, [points, timezone, chartVisual]);

  const stats = useMemo(() => {
    if (!finite.length) return { min: null, avg: null, max: null, n: 0 };
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const avg = finite.reduce((a, b) => a + b, 0) / finite.length;
    return { min, max, avg, n: finite.length };
  }, [finite]);

  const useChartJs = CARTESIAN_CHART_JS.has(chartVisual);

  const chart = useMemo(() => {
    const W = 560;
    const H = 132;
    const padL = 34;
    const padR = 8;
    const padT = 8;
    const padB = 6;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const empty = {
      W,
      H,
      padL,
      padT,
      padB,
      innerW,
      innerH,
      path: '',
      area: '',
      yTicks: [] as number[],
      yMin: 0,
      yMax: 1,
      coords: [] as PlotCoord[],
      bars: [] as { x: number; y: number; w: number; h: number }[],
      pieSlices: [] as PieSlice[],
      donutSlices: [] as PieSlice[],
      heatCells: [] as HeatCell[],
      treemapCells: [] as TreemapCell[],
      radarPoints: '' as string,
      radarGrid: [] as string[],
      boxPlot: null as null | {
        whiskerLeft: number;
        whiskerRight: number;
        boxLeft: number;
        boxRight: number;
        median: number;
        y: number;
      },
    };
    if (!finite.length) return empty;

    const minV = Math.min(...finite);
    const maxV = Math.max(...finite);
    const span = maxV - minV || 1;
    const yMin = minV - span * 0.08;
    const yMax = maxV + span * 0.08;
    const ySpan = yMax - yMin || 1;
    const baseY = padT + innerH;

    const coords = buildPlotCoords(values, padL, padT, innerW, innerH, yMin, ySpan);
    const path = pathFromCoords(coords);
    let area = '';
    if (coords.length >= 2) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      area = `${path} L ${last.x.toFixed(1)} ${baseY.toFixed(1)} L ${first.x.toFixed(1)} ${baseY.toFixed(1)} Z`;
    }

    const slot = innerW / Math.max(values.length, 1);
    const barW = Math.max(1.2, Math.min(10, slot * 0.72));
    const bars = coords.map(c => ({
      x: c.x - barW / 2,
      y: c.y,
      w: barW,
      h: Math.max(0, baseY - c.y),
    }));

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(t => yMin + (1 - t) * ySpan);

    const pieCx = padL + innerW / 2;
    const pieCy = padT + innerH / 2;
    const pieSlices = buildPieSlices(dailyBuckets, minV, maxV, pieCx, pieCy, Math.min(innerW, innerH) * 0.42, 0);
    const donutSlices = buildPieSlices(
      dailyBuckets,
      minV,
      maxV,
      pieCx,
      pieCy,
      Math.min(innerW, innerH) * 0.42,
      Math.min(innerW, innerH) * 0.22,
    );

    const heatCells = buildHeatCells(finite, padL, padT, innerW, innerH);
    const treemapCells = buildTreemapCells(dailyBuckets, padL, padT, innerW, innerH);

    const sorted = [...finite].sort((a, b) => a - b);
    const radarCx = pieCx;
    const radarCy = pieCy;
    const radarR = Math.min(innerW, innerH) * 0.38;
    const radarVals = [
      stats.min ?? sorted[0],
      percentile(sorted, 0.25),
      percentile(sorted, 0.5),
      percentile(sorted, 0.75),
      stats.max ?? sorted[sorted.length - 1],
    ];
    const radarNorm = radarVals.map(v => (v - minV) / span);
    const radarPoints = radarNorm
      .map((t, i) => {
        const angle = -Math.PI / 2 + (i / radarNorm.length) * Math.PI * 2;
        const p = polar(radarCx, radarCy, radarR * (0.2 + t * 0.8), angle);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');
    const radarGrid = [0.35, 0.6, 0.85].map(level =>
      radarNorm
        .map((_, i) => {
          const angle = -Math.PI / 2 + (i / radarNorm.length) * Math.PI * 2;
          const p = polar(radarCx, radarCy, radarR * level, angle);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' '),
    );

    const xScale = (v: number) => padL + ((v - minV) / span) * innerW;
    const boxY = padT + innerH / 2;
    const boxPlot = {
      whiskerLeft: xScale(sorted[0]),
      whiskerRight: xScale(sorted[sorted.length - 1]),
      boxLeft: xScale(percentile(sorted, 0.25)),
      boxRight: xScale(percentile(sorted, 0.75)),
      median: xScale(percentile(sorted, 0.5)),
      y: boxY,
    };

    return {
      W,
      H,
      padL,
      padT,
      padB,
      innerW,
      innerH,
      path,
      area,
      yTicks,
      yMin,
      yMax,
      coords,
      bars,
      baseY,
      pieSlices,
      donutSlices,
      heatCells,
      treemapCells,
      radarPoints,
      radarGrid,
      boxPlot,
    };
  }, [finite, values, dailyBuckets, stats.min, stats.max]);

  const unit = metricUnit(metric);
  const fmt = (v: number | null) =>
    v != null && Number.isFinite(v) ? `${v.toFixed(metric === 'press' ? 0 : 1)}${unit}` : '—';

  const chartJsData = useMemo(
    () => ({
      labels: chartSeries.displayLabels,
      datasets: [
        {
          label: `${metricLabel(metric)} (${unit})`,
          data: chartSeries.values,
          borderColor: '#34d399',
          backgroundColor:
            chartVisual === 'bar' ? 'rgba(52, 211, 153, 0.55)' : 'rgba(52, 211, 153, 0.18)',
          fill: chartVisual === 'area' || chartVisual === 'line',
          tension: 0.28,
          borderWidth: chartVisual === 'bar' ? 1 : 2,
          pointRadius:
            chartSeries.values.length > 160 ? 0 : chartSeries.values.length > 80 ? 1.5 : 2.5,
          pointHoverRadius: 4,
          pointBackgroundColor: '#6ee7b7',
          pointBorderColor: '#064e3b',
          pointBorderWidth: 1,
          spanGaps: true,
        },
      ],
    }),
    [chartSeries.displayLabels, chartSeries.values, metric, unit, chartVisual],
  );

  const chartJsOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: chartReady ? 280 : 0 },
      interaction: { mode: 'index' as const, intersect: false },
      layout: { padding: { top: 12, right: 8, bottom: 4, left: 2 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          borderColor: 'rgba(52, 211, 153, 0.35)',
          borderWidth: 1,
          titleFont: { size: 10, weight: '600' as const },
          bodyFont: { size: 10 },
          callbacks: {
            title: (items: Array<{ dataIndex: number }>) => {
              const idx = items[0]?.dataIndex ?? 0;
              return chartSeries.labels[idx] ?? '';
            },
            label: (ctx: { parsed: { y: number | null } }) => {
              const v = ctx.parsed.y;
              if (v == null || !Number.isFinite(v)) return `${metricLabel(metric)}: —`;
              return `${metricLabel(metric)}: ${v.toFixed(metric === 'press' ? 0 : 2)} ${unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: 'rgba(255, 255, 255, 0.55)',
            maxTicksLimit: Math.min(14, Math.max(chartSeries.displayLabels.length, 4)),
            autoSkip: chartSeries.displayLabels.length > 10,
            maxRotation: chartSeries.displayLabels.length > 8 ? 40 : 0,
            minRotation: chartSeries.displayLabels.length > 8 ? 20 : 0,
            font: { size: 9 },
            padding: 6,
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          border: { color: 'rgba(255, 255, 255, 0.08)' },
        },
        y: {
          grace: '8%',
          ticks: {
            color: 'rgba(255, 255, 255, 0.55)',
            font: { size: 9 },
            padding: 6,
            callback: (value: string | number) => {
              const n = Number(value);
              if (!Number.isFinite(n)) return value;
              return metric === 'temp' ? Math.round(n) : n.toFixed(metric === 'rain' ? 1 : 0);
            },
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          border: { color: 'rgba(255, 255, 255, 0.08)' },
          title: {
            display: true,
            text: unit,
            color: 'rgba(255, 255, 255, 0.45)',
            font: { size: 9, weight: '600' as const },
          },
        },
      },
    }),
    [chartReady, chartSeries.displayLabels.length, chartSeries.labels, metric, unit],
  );

  const scatterRadius = values.length > 120 ? 1.8 : values.length > 60 ? 2.2 : 2.8;
  const showTimeAxis = TIME_AXIS_CHARTS.has(chartVisual);
  const activeTitle = chartDef(chartVisual).title;

  const statCards = [
    { id: 'min', label: 'Min', value: fmt(stats.min), kind: 'min' as const },
    { id: 'avg', label: 'Avg', value: fmt(stats.avg), kind: 'avg' as const },
    { id: 'max', label: 'Max', value: fmt(stats.max), kind: 'max' as const },
    { id: 'n', label: 'Points', value: String(stats.n), kind: 'samples' as const },
  ];

  const insightBuckets = useMemo(() => dailyBuckets.slice(-8), [dailyBuckets]);

  const miniBar = useMemo(() => {
    const W = 220;
    const H = 88;
    const padL = 6;
    const padR = 6;
    const padT = 8;
    const padB = 16;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    if (!insightBuckets.length) return null;
    const vals = insightBuckets.map(b => b.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const baseY = padT + innerH;
    const slot = innerW / insightBuckets.length;
    const barW = Math.max(5, Math.min(14, slot * 0.58));
    const bars = insightBuckets.map((b, i) => {
      const h = ((b.value - min) / span) * innerH * 0.86 + innerH * 0.05;
      const x = padL + i * slot + (slot - barW) / 2;
      const t = valueToT(b.value, min, max);
      return {
        key: b.date,
        x,
        y: baseY - h,
        w: barW,
        h,
        color: luxuryMonoFill(t),
        label: b.label,
        valueText: b.value.toFixed(metric === 'press' ? 0 : 1),
      };
    });
    return { W, H, bars, baseY, min, max };
  }, [insightBuckets, metric]);

  const miniPie = useMemo(() => {
    if (!insightBuckets.length) return null;
    const vals = insightBuckets.map(b => b.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const size = 96;
    const cx = size / 2;
    const cy = size / 2;
    const outerR = 40;
    const slices = buildValueColoredPieSlices(insightBuckets, min, max, cx, cy, outerR, 0);
    const total = insightBuckets.reduce((s, b) => s + Math.max(b.value, 0), 0);
    const legend = insightBuckets
      .map(b => ({
        key: b.date,
        label: b.label,
        pct: total > 0 ? (Math.max(b.value, 0) / total) * 100 : 0,
        color: luxuryMonoFill(valueToT(b.value, min, max)),
        valueText: b.value.toFixed(metric === 'press' ? 0 : 1),
      }))
      .sort((a, b) => b.pct - a.pct);
    return { size, slices, legend, cx, cy, total };
  }, [insightBuckets, metric]);

  const windRose = useMemo(() => {
    const bins = buildWindRoseBins(points);
    if (!bins.some(b => b.count > 0)) return null;
    const W = 120;
    const H = 120;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = 46;
    const innerR = 10;
    const maxVal = Math.max(...bins.map(b => b.value), 0.1);
    const sectors = bins.map(bin => {
      const centerRad = ((bin.degCenter - 90) * Math.PI) / 180;
      const half = Math.PI / 8;
      const r = Math.max(8, (bin.value / maxVal) * maxR);
      return {
        key: bin.dir,
        degCenter: bin.degCenter,
        d: ringSlicePath(cx, cy, r, innerR, centerRad - half, centerRad + half),
        color: luxuryWindFill(valueToT(bin.value, 0, maxVal)),
        dir: bin.dir,
        valueText: bin.value.toFixed(1),
        count: bin.count,
      };
    });
    return { W, H, cx, cy, maxR, sectors };
  }, [points]);

  return (
    <div className="si-wx-history">
      <div className="si-wx-history__stats">
        {statCards.map(card => (
          <div key={card.id} className="si-wx-history__chip si-wx-history__stat-tab">
            <i className={`fa-solid ${statCardIcon(metric, card.kind)}`} aria-hidden />
            <span className="si-wx-history__chip-label">{card.label}</span>
            <span className="si-wx-history__chip-value">{card.value}</span>
          </div>
        ))}
      </div>

      <div className="si-wx-history__chart-wrap si-wx-history__timeline-card">
        <div className="si-wx-history__chart-head">
          <div className="si-wx-history__section-title">
            <i className="fa-solid fa-chart-line" aria-hidden />
            <span>Timeline</span>
          </div>
          <ChartTypePicker chartVisual={chartVisual} onChange={setChartVisual} />
        </div>

        <div className="si-wx-history__chart-controls">
          <div className="si-wx-history__field si-wx-history__field--aggregate">
            <span className="si-wx-history__field-label">Aggregate</span>
            <div className="si-wx-history__aggregate" role="group" aria-label="Time aggregation">
              {WEATHER_AGGREGATE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`si-wx-history__aggregate-btn${timeAggregation === value ? ' is-on' : ''}`}
                  aria-pressed={timeAggregation === value}
                  onClick={() => setTimeAggregation(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="si-wx-history__chart-meta">
            {chartSeries.values.length.toLocaleString()} points · {metricLabel(metric)} ·{' '}
            {timeAggregation}
          </span>
        </div>

        <div
          className={`si-wx-history__plot${useChartJs ? ' si-wx-history__plot--chartjs' : ''}`}
        >
          {useChartJs ? (
            <div className="si-wx-history__chart-canvas-wrap">
              {chartSeries.values.length ? (
                chartVisual === 'bar' ? (
                  <Bar data={chartJsData} options={chartJsOptions} />
                ) : (
                  <Line data={chartJsData} options={chartJsOptions} />
                )
              ) : (
                <p className="si-wx-history__chart-empty">No data for this aggregation.</p>
              )}
            </div>
          ) : (
          <svg
            className="si-wx-history__chart"
            viewBox={`0 0 ${chart.W} ${chart.H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`${metricLabel(metric)} ${activeTitle}`}
          >
            <defs>
              <linearGradient id="si-wx-timeline-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
              </linearGradient>
              <linearGradient id="si-wx-bar-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(167,243,208,0.88)" />
                <stop offset="100%" stopColor="rgba(52,211,153,0.28)" />
              </linearGradient>
            </defs>
            {(chartVisual === 'line' ||
              chartVisual === 'bar' ||
              chartVisual === 'area' ||
              chartVisual === 'scatter') &&
              chart.yTicks.map((tick, i) => {
                const ySpan = chart.yMax - chart.yMin || 1;
                const y = chart.padT + chart.innerH - ((tick - chart.yMin) / ySpan) * chart.innerH;
                return (
                  <g key={i}>
                    <line
                      x1={chart.padL}
                      x2={chart.padL + chart.innerW}
                      y1={y}
                      y2={y}
                      className="si-wx-history__grid"
                    />
                    <text x={4} y={y + 3} className="si-wx-history__ylabel">
                      {metric === 'temp' ? Math.round(tick) : tick.toFixed(metric === 'rain' ? 1 : 0)}
                    </text>
                  </g>
                );
              })}

            {chartVisual === 'bar'
              ? chart.bars.map((b, i) => (
                  <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={1} className="si-wx-history__bar" />
                ))
              : null}

            {chartVisual === 'scatter'
              ? chart.coords.map((c, i) => (
                  <circle key={i} cx={c.x} cy={c.y} r={scatterRadius} className="si-wx-history__dot" />
                ))
              : null}

            {chartVisual === 'area' && chart.area ? (
              <path d={chart.area} className="si-wx-history__area si-wx-history__area--solo" />
            ) : null}

            {chartVisual === 'line' ? (
              <>
                {chart.area ? <path d={chart.area} className="si-wx-history__area" /> : null}
                {chart.path ? <path d={chart.path} className="si-wx-history__line" fill="none" /> : null}
              </>
            ) : null}

            {chartVisual === 'area' && chart.path ? (
              <path d={chart.path} className="si-wx-history__line si-wx-history__line--soft" fill="none" />
            ) : null}

            {chartVisual === 'pie'
              ? chart.pieSlices.map(s => <path key={s.key} d={s.d} fill={s.color} className="si-wx-history__slice" />)
              : null}

            {chartVisual === 'donut'
              ? chart.donutSlices.map(s => (
                  <path key={s.key} d={s.d} fill={s.color} className="si-wx-history__slice" />
                ))
              : null}

            {chartVisual === 'heatmap'
              ? chart.heatCells.map(c => (
                  <rect
                    key={c.key}
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx={1}
                    className="si-wx-history__heat"
                    fill={`rgba(251, 146, 60, ${c.opacity.toFixed(2)})`}
                  />
                ))
              : null}

            {chartVisual === 'treemap'
              ? chart.treemapCells.map(c => (
                  <rect
                    key={c.key}
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx={1}
                    className="si-wx-history__treemap"
                    fill={c.color}
                    opacity={0.88}
                  />
                ))
              : null}

            {chartVisual === 'radar' ? (
              <g className="si-wx-history__radar">
                {chart.radarGrid.map((pts, i) => (
                  <polygon key={i} points={pts} className="si-wx-history__radar-grid" />
                ))}
                {chart.radarPoints ? (
                  <polygon points={chart.radarPoints} className="si-wx-history__radar-fill" />
                ) : null}
                {chart.radarPoints ? (
                  <polyline points={`${chart.radarPoints} ${chart.radarPoints.split(' ')[0]}`} className="si-wx-history__radar-line" />
                ) : null}
              </g>
            ) : null}

            {chartVisual === 'boxplot' && chart.boxPlot ? (
              <g className="si-wx-history__boxplot">
                <line
                  x1={chart.boxPlot.whiskerLeft}
                  x2={chart.boxPlot.whiskerRight}
                  y1={chart.boxPlot.y}
                  y2={chart.boxPlot.y}
                  className="si-wx-history__box-whisker"
                />
                <line
                  x1={chart.boxPlot.whiskerLeft}
                  x2={chart.boxPlot.whiskerLeft}
                  y1={chart.boxPlot.y - 10}
                  y2={chart.boxPlot.y + 10}
                  className="si-wx-history__box-whisker"
                />
                <line
                  x1={chart.boxPlot.whiskerRight}
                  x2={chart.boxPlot.whiskerRight}
                  y1={chart.boxPlot.y - 10}
                  y2={chart.boxPlot.y + 10}
                  className="si-wx-history__box-whisker"
                />
                <rect
                  x={chart.boxPlot.boxLeft}
                  y={chart.boxPlot.y - 14}
                  width={Math.max(2, chart.boxPlot.boxRight - chart.boxPlot.boxLeft)}
                  height={28}
                  rx={2}
                  className="si-wx-history__box-body"
                />
                <line
                  x1={chart.boxPlot.median}
                  x2={chart.boxPlot.median}
                  y1={chart.boxPlot.y - 14}
                  y2={chart.boxPlot.y + 14}
                  className="si-wx-history__box-median"
                />
              </g>
            ) : null}
          </svg>
          )}
          {!useChartJs &&
          (chartVisual === 'line' ||
          chartVisual === 'bar' ||
          chartVisual === 'area' ||
          chartVisual === 'scatter') ? (
            <span className="si-wx-history__y-unit">{unit}</span>
          ) : null}
        </div>

        {!useChartJs && showTimeAxis && xAxisLabels.length ? (
          <div className="si-wx-history__xaxis" aria-hidden>
            {xAxisLabels.map((xl, i) => (
              <div
                key={`${xl.pct}-${i}`}
                className={`si-wx-history__xaxis-label si-wx-history__xaxis-label--${xl.align}`}
                style={{ left: `${xl.pct}%` }}
              >
                <span className="si-wx-history__xaxis-date">{xl.line1}</span>
                {xl.line2 ? <span className="si-wx-history__xaxis-time">{xl.line2}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="si-wx-history__insights" aria-label="Summary charts">
        <div className="si-wx-history__insight-card si-wx-history__insight-card--bar">
          <div className="si-wx-history__insight-head">
            <i className="fa-solid fa-chart-column" aria-hidden />
            <span>Bar chart</span>
          </div>
          <div className="si-wx-history__insight-body">
            {miniBar ? (
              <>
                <svg
                  className="si-wx-history__insight-chart"
                  viewBox={`0 0 ${miniBar.W} ${miniBar.H}`}
                  preserveAspectRatio="xMidYMax meet"
                  role="img"
                  aria-label={`Daily ${metricLabel(metric)} bar chart`}
                >
                  {miniBar.bars.map(b => (
                    <g key={b.key}>
                      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill={b.color} />
                      <text x={b.x + b.w / 2} y={miniBar.baseY + 11} className="si-wx-history__insight-x">
                        {b.label}
                      </text>
                      <text x={b.x + b.w / 2} y={b.y - 3} className="si-wx-history__insight-val">
                        {b.valueText}
                      </text>
                    </g>
                  ))}
                </svg>
                <p className="si-wx-history__insight-caption">Daily average · {unit}</p>
              </>
            ) : (
              <p className="si-wx-history__insight-empty">No daily values</p>
            )}
          </div>
        </div>

        <div className="si-wx-history__insight-card si-wx-history__insight-card--wind">
          <div className="si-wx-history__insight-head">
            <i className="fa-solid fa-compass" aria-hidden />
            <span>Wind rose</span>
          </div>
          <div className="si-wx-history__insight-body">
            {windRose ? (
              <>
                <div className="si-wx-history__insight-wind-stage">
                  <svg
                    className="si-wx-history__insight-wind"
                    viewBox={`0 0 ${windRose.W} ${windRose.H}`}
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label="Wind rose by direction"
                  >
                    {[0.25, 0.5, 0.75, 1].map(level => (
                      <circle
                        key={level}
                        cx={windRose.cx}
                        cy={windRose.cy}
                        r={windRose.maxR * level}
                        className="si-wx-history__wind-ring"
                      />
                    ))}
                    {WIND_DIRS.map((dir, i) => {
                      const angle = ((i * 45 - 90) * Math.PI) / 180;
                      const x2 = windRose.cx + Math.cos(angle) * windRose.maxR;
                      const y2 = windRose.cy + Math.sin(angle) * windRose.maxR;
                      return (
                        <line
                          key={dir}
                          x1={windRose.cx}
                          y1={windRose.cy}
                          x2={x2}
                          y2={y2}
                          className="si-wx-history__wind-spoke"
                        />
                      );
                    })}
                    {windRose.sectors.map(s => (
                      <path key={s.key} d={s.d} fill={s.color} />
                    ))}
                    {windRose.sectors
                      .filter(s => s.count > 0)
                      .map(s => {
                        const angle = ((s.degCenter - 90) * Math.PI) / 180;
                        const tx = windRose.cx + Math.cos(angle) * (windRose.maxR + 10);
                        const ty = windRose.cy + Math.sin(angle) * (windRose.maxR + 10);
                        return (
                          <text key={`${s.key}-lbl`} x={tx} y={ty} className="si-wx-history__wind-label">
                            {s.dir}
                          </text>
                        );
                      })}
                  </svg>
                </div>
                <ul className="si-wx-history__insight-wind-legend">
                  {windRose.sectors
                    .filter(s => s.count > 0)
                    .map(s => (
                      <li key={s.key}>
                        <span className="si-wx-history__insight-swatch" style={{ background: s.color }} aria-hidden />
                        <span>{s.dir}</span>
                        <span>{s.valueText} km/h</span>
                        <span className="si-wx-history__insight-legend-pct">n={s.count}</span>
                      </li>
                    ))}
                </ul>
              </>
            ) : (
              <p className="si-wx-history__insight-empty">No wind direction data</p>
            )}
          </div>
        </div>

        <div className="si-wx-history__insight-card si-wx-history__insight-card--pie">
          <div className="si-wx-history__insight-head">
            <i className="fa-solid fa-chart-pie" aria-hidden />
            <span>Pie chart</span>
          </div>
          <div className="si-wx-history__insight-body">
            {miniPie ? (
              <div className="si-wx-history__insight-pie-stack">
                <div className="si-wx-history__insight-pie-stage" aria-hidden>
                  <svg
                    className="si-wx-history__insight-pie"
                    viewBox={`0 0 ${miniPie.size} ${miniPie.size}`}
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label={`Daily ${metricLabel(metric)} share`}
                  >
                    {miniPie.slices.map(s => (
                      <path key={s.key} d={s.d} fill={s.color} className="si-wx-history__insight-pie-slice" />
                    ))}
                  </svg>
                </div>
                <ul className="si-wx-history__insight-key-list" aria-label={`${metricLabel(metric)} distribution`}>
                  {miniPie.legend.map(row => (
                    <li key={row.key} className="si-wx-history__insight-key-row">
                      <span className="si-wx-history__insight-key-swatch" style={{ background: row.color }} aria-hidden />
                      <span className="si-wx-history__insight-key-label">{row.label}</span>
                      <span className="si-wx-history__insight-key-val">
                        {row.valueText}
                        <span className="si-wx-history__insight-key-unit">{unit}</span>
                      </span>
                      <span className="si-wx-history__insight-key-pct">{row.pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="si-wx-history__insight-empty">No share data</p>
            )}
          </div>
        </div>
      </div>

      <div className="si-wx-history__range-row">
        <label className="si-wx-history__date-field">
          <input
            type="date"
            value={startDate}
            min={minDate}
            max={endDate || maxDate}
            onChange={e => onRangeChange(e.target.value, endDate)}
          />
        </label>
        <span className="si-wx-history__range-sep">→</span>
        <label className="si-wx-history__date-field">
          <input
            type="date"
            value={endDate}
            min={startDate || minDate}
            max={maxDate}
            onChange={e => onRangeChange(startDate, e.target.value)}
          />
        </label>
        {onExport ? (
          <button
            type="button"
            className={`si-wx-history__export${exportLoading ? ' si-wx-history__export--busy' : ''}`}
            title={exportProgressLabel || 'Export Climate Report (XLSX)'}
            onClick={onExport}
            disabled={exportLoading}
            aria-busy={exportLoading}
          >
            <i
              className={`fa-solid ${exportLoading ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
    </div>
  );
};
