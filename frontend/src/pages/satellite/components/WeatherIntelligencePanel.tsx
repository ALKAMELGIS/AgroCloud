import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSiInstanceScope } from '../siInstanceScope';
import './WeatherIntelligencePanel.css';
import {
  clampOpenMeteoPickerDate,
  fetchOpenMeteoDailyForDate,
  fetchOpenMeteoHistoryRange,
  fetchOpenMeteoTemporalComparison,
  fetchOpenMeteoTimeHistory,
  fetchOpenMeteoWeather,
  geocodePlaceQuery,
  metricLabel,
  resolveOpenMeteoDatePickerBounds,
  reversePlaceLabel,
  wmoWeatherIconClass,
  wmoWeatherToneClass,
  type OpenMeteoDailyDetail,
  type OpenMeteoTemporalCard,
  type OpenMeteoTimeHistory,
  type OpenMeteoWeatherSnapshot,
  type WeatherHistoryMetric,
} from '../../../lib/openMeteoWeather';
import { WeatherTimeHistoryChart } from './WeatherTimeHistoryChart';
import {
  buildWeatherClimateReportPayload,
  climateAggregationLabel,
} from '../lib/weatherClimateReport/weatherClimateAnalysisEngine';
import { generateMeteoDataReportExcel } from '../lib/weatherClimateReport/meteoDataReportExcelWriter';
import { generateWeatherClimateReportDocx } from '../lib/weatherClimateReport/generateWeatherClimateReportDocx';
import type { WeatherTimeAggregation } from '../lib/weatherHistoryChartAggregate';
import type { WeatherExportFormat } from './WeatherTimeHistoryChart';

export type WeatherLocation = {
  lat: number;
  lng: number;
  label: string;
};

type WeatherIntelligencePanelProps = {
  open: boolean;
  onClose: () => void;
  location: WeatherLocation;
  onLocationChange: (loc: WeatherLocation) => void;
  mapPickActive: boolean;
  onMapPickToggle: (active: boolean) => void;
  onBeginMapPick?: () => void;
  mapboxToken?: string;
  /** Narrower default size for AgroCloud Platform map overlay. */
  layout?: 'default' | 'acp-compact';
  /** Optional AOI / field name for climate report exports. */
  aoiName?: string;
};

type PanelView = 'forecast' | 'history';

const PANEL_GEOM_LS = 'agri_si_weather_panel_geom_v1';
const MIN_W = 252;
const MIN_H = 248;
const DEFAULT_W = 288;
const DEFAULT_H = 372;
const ACP_MIN_W = 240;
const ACP_MIN_H = 248;
const ACP_DEFAULT_W = 264;
const ACP_DEFAULT_H = 372;
const ACP_HISTORY_PANEL_H = 440;
const ACP_HISTORY_MIN_H = 280;
/** Preferred layout size for Time History (timeline + 3 insight cards). */
const HISTORY_PANEL_W = 372;
const HISTORY_PANEL_H = 600;
const HISTORY_MIN_W = 300;
const HISTORY_MIN_H = 420;

type PanelGeom = { x: number; y: number; w: number; h: number };

/**
 * Keep a panel geometry fully inside the viewport (with an 8px margin) so no
 * edge is ever clipped or pushed off-screen, on any screen size.
 */
function clampGeomToViewport(g: PanelGeom, minW: number, minH: number): PanelGeom {
  if (typeof window === 'undefined') return g;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availW = Math.max(160, vw - margin * 2);
  const availH = Math.max(160, vh - margin * 2);
  const w = clamp(g.w, Math.min(minW, availW), availW);
  const h = clamp(g.h, Math.min(minH, availH), availH);
  const x = clamp(g.x, margin, Math.max(margin, vw - w - margin));
  const y = clamp(g.y, margin, Math.max(margin, vh - h - margin));
  return { x, y, w, h };
}

const HISTORY_METRICS: WeatherHistoryMetric[] = ['temp', 'rain', 'humid', 'wind', 'press'];
const HISTORY_RANGE_OPTIONS = [
  { days: 7, label: '7d', mode: 'forecast' as const },
  { days: 14, label: '14d', mode: 'forecast' as const },
  { days: 30, label: '30d', mode: 'forecast' as const },
  { days: 365, label: '1y', mode: 'archive' as const },
  { days: 1825, label: '5y', mode: 'archive' as const },
] as const

type HistoryRangeDays = (typeof HISTORY_RANGE_OPTIONS)[number]['days']

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function readPanelGeom(storageKey: string, compact = false): PanelGeom {
  const minW = compact ? ACP_MIN_W : MIN_W;
  const minH = compact ? ACP_MIN_H : MIN_H;
  const defaultW = compact ? ACP_DEFAULT_W : DEFAULT_W;
  const defaultH = compact ? ACP_DEFAULT_H : DEFAULT_H;
  if (typeof window === 'undefined') {
    return { x: 12, y: 68, w: defaultW, h: defaultH };
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error('empty');
    const p = JSON.parse(raw) as PanelGeom;
    if (
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      Number.isFinite(p.w) &&
      Number.isFinite(p.h)
    ) {
      return clampGeomToViewport(p, minW, minH);
    }
  } catch {
    /* ignore */
  }
  return clampGeomToViewport(
    {
      x: compact ? Math.max(8, window.innerWidth - defaultW - 12) : 12,
      y: 68,
      w: defaultW,
      h: defaultH,
    },
    minW,
    minH,
  );
}

function todayIsoInTimezone(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const d = parts.find(p => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return new Date().toISOString().slice(0, 10);
}

function formatPanelDate(iso: string, tz: string): string {
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

function formatHourLabel(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso.slice(11, 16);
  }
}

function metricIcon(metric: WeatherHistoryMetric): string {
  switch (metric) {
    case 'temp':
      return 'fa-solid fa-temperature-half';
    case 'rain':
      return 'fa-solid fa-cloud-rain';
    case 'humid':
      return 'fa-solid fa-droplet';
    case 'wind':
      return 'fa-solid fa-wind';
    case 'press':
      return 'fa-solid fa-gauge-high';
    default:
      return 'fa-solid fa-chart-line';
  }
}

function filterHistoryByRange(history: OpenMeteoTimeHistory, start: string, end: string): OpenMeteoTimeHistory {
  const points = history.points.filter(p => {
    const d = p.time.slice(0, 10);
    return d >= start && d <= end;
  });
  return { ...history, points, startDate: start, endDate: end };
}

function fitHistoryPanelGeom(prev: PanelGeom, compact = false): PanelGeom {
  if (typeof window === 'undefined') {
    return compact
      ? { x: prev.x, y: prev.y, w: ACP_DEFAULT_W, h: ACP_HISTORY_PANEL_H }
      : { x: 12, y: 68, w: HISTORY_PANEL_W, h: HISTORY_PANEL_H };
  }
  if (compact) {
    const w = Math.max(prev.w, ACP_DEFAULT_W);
    const h = Math.max(prev.h, ACP_HISTORY_PANEL_H);
    return clampGeomToViewport({ x: prev.x, y: prev.y, w, h }, ACP_MIN_W, ACP_HISTORY_MIN_H);
  }
  return clampGeomToViewport(
    { x: prev.x, y: prev.y, w: HISTORY_PANEL_W, h: HISTORY_PANEL_H },
    HISTORY_MIN_W,
    HISTORY_MIN_H,
  );
}

function useWeatherPanelGeometry(panelGeomLs: string, compact = false) {
  const [geom, setGeom] = useState<PanelGeom>(() => readPanelGeom(panelGeomLs, compact));
  const geomRef = useRef(geom);
  geomRef.current = geom;

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(panelGeomLs, JSON.stringify(geomRef.current));
    } catch {
      /* ignore */
    }
  }, [panelGeomLs]);

  // Keep the panel inside the viewport whenever the window is resized / rotated
  // so no edge is ever pushed off-screen on Desktop, Tablet or Mobile.
  useEffect(() => {
    const minW = compact ? ACP_MIN_W : MIN_W;
    const minH = compact ? ACP_MIN_H : MIN_H;
    const onResize = () => {
      setGeom(prev => clampGeomToViewport(prev, minW, minH));
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [compact]);

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, label, a, [data-drag-exclude]')) return;
      e.preventDefault();
      const surface = e.currentTarget;
      try {
        surface.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...geomRef.current };
      const onMove = (ev: PointerEvent) => {
        const maxX = Math.max(4, window.innerWidth - origin.w - 4);
        const maxY = Math.max(4, window.innerHeight - origin.h - 4);
        setGeom({
          ...origin,
          x: clamp(origin.x + ev.clientX - startX, 4, maxX),
          y: clamp(origin.y + ev.clientY - startY, 4, maxY),
        });
      };
      const onDone = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onDone);
        window.removeEventListener('pointercancel', onDone);
        try {
          surface.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        persist();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onDone);
      window.addEventListener('pointercancel', onDone);
    },
    [persist],
  );

  const startResize = useCallback(
    (e: React.PointerEvent, opts?: { minW?: number; minH?: number }) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { ...geomRef.current };
      const minW = opts?.minW ?? (compact ? ACP_MIN_W : MIN_W);
      const minH = opts?.minH ?? (compact ? ACP_MIN_H : MIN_H);
      const maxW = Math.min(compact ? 360 : 520, window.innerWidth - origin.x - 8);
      const maxH = Math.min(Math.round(window.innerHeight * 0.92), window.innerHeight - origin.y - 8);
      const onMove = (ev: PointerEvent) => {
        setGeom({
          ...origin,
          w: clamp(origin.w + ev.clientX - startX, minW, maxW),
          h: clamp(origin.h + ev.clientY - startY, minH, maxH),
        });
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        persist();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [persist, compact],
  );

  return { geom, setGeom, startDrag, startResize };
}

export const WeatherIntelligencePanel: React.FC<WeatherIntelligencePanelProps> = ({
  open,
  onClose,
  location,
  onLocationChange,
  mapPickActive,
  onMapPickToggle,
  onBeginMapPick,
  mapboxToken,
  layout = 'default',
  aoiName,
}) => {
  const compact = layout === 'acp-compact';
  const { scopedStorageKey } = useSiInstanceScope();
  const panelGeomLs = scopedStorageKey(compact ? 'agri_acp_weather_panel_geom_v1' : PANEL_GEOM_LS);
  const [searchText, setSearchText] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<OpenMeteoWeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [compareOpen, setCompareOpen] = useState(true);
  const [panelView, setPanelView] = useState<PanelView>('forecast');
  const [temporalCards, setTemporalCards] = useState<OpenMeteoTemporalCard[]>([]);
  const [temporalLoading, setTemporalLoading] = useState(false);
  const [historyData, setHistoryData] = useState<OpenMeteoTimeHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRangeDays, setHistoryRangeDays] = useState<HistoryRangeDays>(7);
  const [historyMetric, setHistoryMetric] = useState<WeatherHistoryMetric>('temp');
  const [historyDateStart, setHistoryDateStart] = useState('');
  const [historyDateEnd, setHistoryDateEnd] = useState('');
  const [climateExportBusy, setClimateExportBusy] = useState(false);
  const [climateExportProgress, setClimateExportProgress] = useState('');
  const [selectedDayDetail, setSelectedDayDetail] = useState<OpenMeteoDailyDetail | null>(null);
  const [dayDetailLoading, setDayDetailLoading] = useState(false);
  const { geom, setGeom, startDrag, startResize } = useWeatherPanelGeometry(panelGeomLs, compact);

  const loadWeather = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOpenMeteoWeather(lat, lng);
      setSnapshot(data);
      const today = todayIsoInTimezone(data.timezone);
      setSelectedDate(prev => clampOpenMeteoPickerDate(prev, today));
    } catch (e) {
      setSnapshot(null);
      setError(e instanceof Error ? e.message : 'Failed to load weather');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (lat: number, lng: number, days: HistoryRangeDays) => {
    setHistoryLoading(true);
    try {
      const opt = HISTORY_RANGE_OPTIONS.find(o => o.days === days) ?? HISTORY_RANGE_OPTIONS[0]
      let data: OpenMeteoTimeHistory
      if (opt.mode === 'archive') {
        const end = new Date()
        const start = new Date(end.getTime() - days * 86_400_000)
        const startIso = start.toISOString().slice(0, 10)
        const endIso = end.toISOString().slice(0, 10)
        data = await fetchOpenMeteoHistoryRange(lat, lng, startIso, endIso)
      } else {
        data = await fetchOpenMeteoTimeHistory(lat, lng, days as 7 | 14 | 30)
      }
      setHistoryData(data);
      setHistoryDateStart(data.startDate);
      setHistoryDateEnd(data.endDate);
    } catch (e) {
      setHistoryData(null);
      setError(e instanceof Error ? e.message : 'Failed to load weather history');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Load an explicit historical range from the Open-Meteo archive (ERA5), which
  // reaches back to 1950 — so date-range exports actually contain old dates
  // (the forecast endpoint only exposes the last ~30 days).
  const loadHistoryRange = useCallback(async (lat: number, lng: number, startIso: string, endIso: string) => {
    setHistoryLoading(true);
    setError(null);
    try {
      const data = await fetchOpenMeteoHistoryRange(lat, lng, startIso, endIso);
      setHistoryData(data);
      setHistoryDateStart(startIso);
      setHistoryDateEnd(endIso);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load historical weather range');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !location) return;
    void loadWeather(location.lat, location.lng);
  }, [open, location.lat, location.lng, loadWeather]);

  useEffect(() => {
    if (!open) onMapPickToggle(false);
  }, [open, onMapPickToggle]);

  useEffect(() => {
    if (!open || panelView !== 'history' || !location) return;
    void loadHistory(location.lat, location.lng, historyRangeDays);
  }, [open, panelView, location.lat, location.lng, historyRangeDays, loadHistory]);

  const tz = snapshot?.timezone ?? 'UTC';
  const todayIso = useMemo(() => todayIsoInTimezone(tz), [tz, snapshot?.observedAt]);
  const datePickerBounds = useMemo(() => resolveOpenMeteoDatePickerBounds(todayIso), [todayIso]);
  const isToday = selectedDate === todayIso;

  const snapshotDailyRow = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.daily.find(d => d.date === selectedDate) ?? null;
  }, [snapshot, selectedDate]);

  const resolvedDay = isToday ? null : selectedDayDetail ?? snapshotDailyRow;

  useEffect(() => {
    if (!open || !location || !snapshot || isToday) {
      setSelectedDayDetail(null);
      setDayDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDayDetailLoading(true);
    void fetchOpenMeteoDailyForDate(location.lat, location.lng, selectedDate, todayIso)
      .then(row => {
        if (!cancelled) setSelectedDayDetail(row);
      })
      .catch(() => {
        if (!cancelled) setSelectedDayDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDayDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, location.lat, location.lng, selectedDate, todayIso, isToday, snapshot]);

  const dailyRow = resolvedDay;

  const displayTemp = isToday
    ? snapshot?.temperatureC
    : dailyRow && 'tempMaxC' in dailyRow
      ? dailyRow.tempMaxC != null && dailyRow.tempMinC != null
        ? Math.round((dailyRow.tempMaxC + dailyRow.tempMinC) / 2)
        : dailyRow.tempMaxC ?? dailyRow.tempMinC ?? null
      : null;
  const displayCode = isToday ? snapshot?.weatherCode : dailyRow?.weatherCode ?? null;
  const displayCondition = isToday
    ? snapshot?.conditionLabel
    : dayDetailLoading && !dailyRow
      ? 'Loading…'
      : dailyRow?.conditionLabel ?? '—';
  const displayWindKmh = isToday ? snapshot?.windSpeedKmh : (dailyRow as OpenMeteoDailyDetail | null)?.windSpeedKmh ?? null;
  const displayWindDir = isToday
    ? snapshot?.windDirectionLabel
    : (dailyRow as OpenMeteoDailyDetail | null)?.windDirectionLabel ?? '—';
  const displayHumidity = isToday ? snapshot?.humidityPct : (dailyRow as OpenMeteoDailyDetail | null)?.humidityPct ?? null;
  const displayPrecip = isToday ? snapshot?.precipMm : dailyRow?.precipMm ?? null;
  const heroToneClass = wmoWeatherToneClass(displayCode);

  const coordLine = `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
  const showPlaceLabel =
    location.label.trim().length > 0 &&
    location.label.trim() !== coordLine &&
    !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(location.label.trim());
  const subtitleLine = showPlaceLabel ? `${location.label} · Map` : `${coordLine} · Map`;

  useEffect(() => {
    if (!open || !snapshot || !location) return;
    let cancelled = false;
    setTemporalLoading(true);
    void fetchOpenMeteoTemporalComparison(
      location.lat,
      location.lng,
      selectedDate,
      todayIso,
      {
        tempC: isToday
          ? snapshot.temperatureC
          : dailyRow?.tempMaxC != null && dailyRow?.tempMinC != null
            ? Math.round((dailyRow.tempMaxC + dailyRow.tempMinC) / 2)
            : dailyRow?.tempMaxC ?? dailyRow?.tempMinC ?? null,
        weatherCode: displayCode,
        conditionLabel: displayCondition,
        windSpeedKmh: isToday ? snapshot.windSpeedKmh : displayWindKmh,
        windDirectionLabel: isToday ? snapshot.windDirectionLabel : displayWindDir,
        humidityPct: isToday ? snapshot.humidityPct : displayHumidity,
        precipMm: isToday ? snapshot.precipMm : displayPrecip,
      },
    )
      .then(cards => {
        if (!cancelled) setTemporalCards(cards);
      })
      .finally(() => {
        if (!cancelled) setTemporalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    snapshot,
    location.lat,
    location.lng,
    selectedDate,
    todayIso,
    isToday,
    dailyRow,
    displayCode,
    displayCondition,
    displayWindKmh,
    displayWindDir,
    displayHumidity,
    displayPrecip,
  ]);

  const filteredHistory = useMemo(() => {
    if (!historyData) return null;
    if (!historyDateStart || !historyDateEnd) return historyData;
    return filterHistoryByRange(historyData, historyDateStart, historyDateEnd);
  }, [historyData, historyDateStart, historyDateEnd]);

  const handleSearch = async () => {
    const q = searchText.trim();
    if (!q) return;
    setSearchBusy(true);
    setError(null);
    onMapPickToggle(false);
    try {
      const hits = await geocodePlaceQuery(q, mapboxToken);
      if (!hits.length) {
        setError('No place found. Try a city name or lat,lng.');
        return;
      }
      const hit = hits[0];
      onLocationChange({ lat: hit.lat, lng: hit.lng, label: hit.label });
      setSearchText('');
    } finally {
      setSearchBusy(false);
    }
  };

  const handleRefresh = () => {
    void loadWeather(location.lat, location.lng);
    if (panelView === 'history') void loadHistory(location.lat, location.lng, historyRangeDays);
  };

  const handleToday = () => setSelectedDate(todayIso);

  const handleDateChange = (next: string) => {
    if (!next) return;
    setSelectedDate(clampOpenMeteoPickerDate(next, todayIso));
    setSelectedDayDetail(null);
  };

  const handlePickLocation = () => {
    setError(null);
    if (onBeginMapPick) onBeginMapPick();
    else onMapPickToggle(true);
  };

  const openHistory = () => {
    setPanelView('history');
    setGeom(g => fitHistoryPanelGeom(g, compact));
  };

  const closeHistory = () => setPanelView('forecast');

  const exportClimateReport = async (
    timeAggregation: WeatherTimeAggregation = 'day',
    format: WeatherExportFormat = 'xlsx',
  ) => {
    if (!filteredHistory?.points.length || climateExportBusy) return;
    setClimateExportBusy(true);
    setClimateExportProgress(`Preparing ${climateAggregationLabel(timeAggregation).toLowerCase()} climate data…`);
    setError(null);
    try {
      const start = historyDateStart || filteredHistory.startDate;
      const end = historyDateEnd || filteredHistory.endDate;
      setClimateExportProgress('Fetching historical archive…');
      const history = await fetchOpenMeteoHistoryRange(location.lat, location.lng, start, end);
      if (!history.points.length) {
        throw new Error('No weather records available for the selected period.');
      }
      setClimateExportProgress(`Analyzing climate trends (${climateAggregationLabel(timeAggregation)})…`);
      const payload = buildWeatherClimateReportPayload({
        aoiName: aoiName?.trim() || location.label,
        aoiLocation: location.label,
        lat: location.lat,
        lng: location.lng,
        timezone: history.timezone,
        elevationM: snapshot?.elevationM ?? null,
        analysisStart: start,
        analysisEnd: end,
        loadedStart: historyData?.startDate ?? history.startDate,
        loadedEnd: historyData?.endDate ?? history.endDate,
        hourlyRecords: history.points,
        timeAggregation,
      });
      if (format === 'docx') {
        setClimateExportProgress('Generating Weather Intelligence Report (DOCX)…');
        await generateWeatherClimateReportDocx(payload);
      } else {
        setClimateExportProgress('Generating Meteo Data Report (XLSX)…');
        await generateMeteoDataReportExcel(payload);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Climate report export failed');
    } finally {
      setClimateExportBusy(false);
      setClimateExportProgress('');
    }
  };

  const enrichLabel = useCallback(async () => {
    const needsEnrich =
      /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(location.label.trim()) || location.label === coordLine;
    if (!needsEnrich) return;
    const label = await reversePlaceLabel(location.lat, location.lng, mapboxToken);
    if (label !== location.label) {
      onLocationChange({ ...location, label });
    }
  }, [location, mapboxToken, onLocationChange, coordLine]);

  useEffect(() => {
    if (open) void enrichLabel();
  }, [open, location.lat, location.lng, enrichLabel]);

  if (!open || !location) return null;

  const hasWeather = Boolean(snapshot && !loading);

  return (
    <div
      className={`si-weather-panel-shell${panelView === 'history' ? ' si-weather-panel-shell--history' : ''}${compact ? ' si-weather-panel-shell--acp-compact' : ''}`}
      style={{ left: geom.x, top: geom.y, width: geom.w, height: geom.h }}
      role="dialog"
      aria-label="Weather Intelligence"
    >
      <div className={`si-weather-panel${panelView === 'history' ? ' si-weather-panel--history' : ''}`}>
        <div
          className="si-weather-panel__chrome si-weather-panel__drag-handle"
          onPointerDown={startDrag}
          title="Drag to move"
        >
          <div className="si-weather-panel__drag-handle-bar" aria-hidden>
            <span className="si-weather-panel__drag-grip" />
          </div>
          {panelView === 'forecast' ? (
            <header className="si-weather-panel__header">
              <div className="si-weather-panel__brand">
                <span className="si-weather-panel__kicker">Open-Meteo</span>
                <h2 className="si-weather-panel__title">{coordLine}</h2>
                <p className="si-weather-panel__subtitle">{subtitleLine}</p>
              </div>
              <div className="si-weather-panel__actions" data-drag-exclude>
                <button
                  type="button"
                  className="si-weather-panel__icon-btn"
                  title="Weather time history"
                  onClick={openHistory}
                >
                  <i className="fa-solid fa-chart-line" aria-hidden />
                </button>
                <button
                  type="button"
                  className="si-weather-panel__icon-btn"
                  title="Refresh"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  <i className={`fa-solid fa-rotate-right${loading ? ' fa-spin' : ''}`} />
                </button>
                <button type="button" className="si-weather-panel__icon-btn" title="Close" onClick={onClose}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </header>
          ) : (
            <header className="si-weather-panel__header si-weather-panel__header--history">
              <div className="si-weather-panel__brand">
                <h2 className="si-weather-panel__title si-weather-panel__title--history">Time History</h2>
                <p className="si-weather-panel__subtitle">
                  {coordLine} · Open-Meteo (historical) · {historyData?.timezone ?? tz}
                </p>
              </div>
              <div className="si-weather-panel__actions" data-drag-exclude>
                <button
                  type="button"
                  className="si-weather-panel__icon-btn"
                  title="Refresh history"
                  onClick={handleRefresh}
                  disabled={historyLoading}
                >
                  <i className={`fa-solid fa-rotate-right${historyLoading ? ' fa-spin' : ''}`} />
                </button>
                <button type="button" className="si-weather-panel__icon-btn" title="Back to forecast" onClick={closeHistory}>
                  <i className="fa-solid fa-chevron-up" />
                </button>
                <button type="button" className="si-weather-panel__icon-btn" title="Close" onClick={onClose}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </header>
          )}
        </div>

        <div className="si-weather-panel__body">
          {panelView === 'history' ? (
            <>
              <div className="si-wx-history__toolbar">
                <div className="si-wx-history__ranges">
                  {HISTORY_RANGE_OPTIONS.map(opt => (
                    <button
                      key={opt.days}
                      type="button"
                      className={`si-wx-history__range-btn${historyRangeDays === opt.days ? ' active' : ''}`}
                      onClick={() => setHistoryRangeDays(opt.days)}
                      title={opt.mode === 'archive' ? `Archive ERA5 · last ${opt.label}` : `Last ${opt.label}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={`si-wx-history__loc-btn${mapPickActive ? ' active' : ''}`}
                  title="Pick location on map"
                  onClick={handlePickLocation}
                >
                  <i className="fa-solid fa-crosshairs" aria-hidden />
                </button>
              </div>

              <div className="si-wx-history__metrics" role="tablist">
                {HISTORY_METRICS.map(m => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={historyMetric === m}
                    className={`si-wx-history__chip si-wx-history__metric-tab${historyMetric === m ? ' active' : ''}`}
                    onClick={() => setHistoryMetric(m)}
                  >
                    <i className={metricIcon(m)} aria-hidden />
                    <span className="si-wx-history__chip-label">{metricLabel(m)}</span>
                  </button>
                ))}
              </div>

              {error ? (
                <p className="si-weather-panel__error" role="alert">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden /> {error}
                </p>
              ) : null}

              {historyLoading ? (
                <p className="si-wx-history__loading">Loading historical series…</p>
              ) : filteredHistory?.points.length ? (
                <WeatherTimeHistoryChart
                  points={filteredHistory.points}
                  metric={historyMetric}
                  timezone={filteredHistory.timezone}
                  startDate={historyDateStart}
                  endDate={historyDateEnd}
                  minDate={datePickerBounds.min}
                  maxDate={todayIso}
                  onRangeChange={(start, end) => {
                    setHistoryDateStart(start);
                    setHistoryDateEnd(end);
                    // When the requested window reaches beyond the currently loaded
                    // (recent) series on either side, pull the archive so historical
                    // dates back to 1950 are actually fetched and exportable.
                    const loadedStart = historyData?.startDate ?? '';
                    const loadedEnd = historyData?.endDate ?? '';
                    if (start && end && (!loadedStart || start < loadedStart || end > loadedEnd)) {
                      void loadHistoryRange(location.lat, location.lng, start, end);
                    }
                  }}
                  onExport={(aggregation, format) => void exportClimateReport(aggregation, format)}
                  exportLoading={climateExportBusy}
                  exportProgressLabel={climateExportProgress || undefined}
                />
              ) : (
                <p className="si-wx-history__loading">
                  {climateExportBusy ? climateExportProgress || 'Generating climate report…' : 'No historical data for this range.'}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="si-weather-panel__toolbar">
                <div className="si-weather-panel__search">
                  <i className="fa-solid fa-magnifying-glass" aria-hidden />
                  <input
                    type="text"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Place or lat,lng"
                    onKeyDown={e => {
                      if (e.key === 'Enter') void handleSearch();
                    }}
                  />
                  <button
                    type="button"
                    className="si-weather-panel__go"
                    onClick={() => void handleSearch()}
                    disabled={searchBusy}
                    aria-label="Search place"
                  >
                    {searchBusy ? '…' : 'Go'}
                  </button>
                </div>
                <button
                  type="button"
                  className={`si-weather-panel__map-pick${mapPickActive ? ' active' : ''}`}
                  onClick={handlePickLocation}
                  aria-pressed={mapPickActive}
                  aria-label={mapPickActive ? 'Picking on map' : 'Pick location on map'}
                  title={mapPickActive ? 'Picking on map…' : 'Pick location on map'}
                >
                  <i className="fa-solid fa-location-crosshairs" aria-hidden />
                </button>
                <label className="si-weather-panel__date">
                  <i className="fa-regular fa-calendar si-wx-metric-icon--date" aria-hidden />
                  <input
                    type="date"
                    value={selectedDate}
                    min={datePickerBounds.min}
                    max={datePickerBounds.max}
                    onChange={e => handleDateChange(e.target.value)}
                    disabled={!snapshot}
                    aria-label="Forecast date"
                  />
                </label>
                <button type="button" className="si-weather-panel__today" onClick={handleToday} disabled={!snapshot}>
                  Today
                </button>
              </div>

              {error ? (
                <p className="si-weather-panel__error" role="alert">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden /> {error}
                </p>
              ) : null}

              <div className={`si-weather-panel__hero${loading ? ' is-loading' : ''}`}>
                <span
                  className={`si-weather-panel__hero-icon ${wmoWeatherIconClass(displayCode)} ${heroToneClass}`}
                  aria-hidden
                />
                <div className="si-weather-panel__hero-text">
                  <span className="si-weather-panel__temp">
                    {displayTemp != null && Number.isFinite(displayTemp) ? `${Math.round(displayTemp)}°C` : '—'}
                  </span>
                  <span className="si-weather-panel__condition">
                    {loading ? 'Loading…' : displayCondition}
                  </span>
                  {!isToday && dailyRow ? (
                    <span className="si-weather-panel__range">
                      {dailyRow.tempMinC != null ? `${Math.round(dailyRow.tempMinC)}°` : '—'} –{' '}
                      {dailyRow.tempMaxC != null ? `${Math.round(dailyRow.tempMaxC)}°` : '—'}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="si-weather-panel__metrics">
                <div className="si-weather-panel__metric">
                  <i className="fa-solid fa-wind si-wx-metric-icon--wind" aria-hidden />
                  <span className="si-weather-panel__metric-label">Wind</span>
                  <span className="si-weather-panel__metric-value">
                    {displayWindKmh != null
                      ? `${Math.round(displayWindKmh)} km/h ${displayWindDir}`
                      : '—'}
                  </span>
                </div>
                <div className="si-weather-panel__metric">
                  <i className="fa-solid fa-droplet si-wx-metric-icon--humidity" aria-hidden />
                  <span className="si-weather-panel__metric-label">Humidity</span>
                  <span className="si-weather-panel__metric-value">
                    {displayHumidity != null ? `${Math.round(displayHumidity)}%` : '—'}
                  </span>
                </div>
                <div className="si-weather-panel__metric">
                  <i className="fa-solid fa-cloud-rain si-wx-metric-icon--precip" aria-hidden />
                  <span className="si-weather-panel__metric-label">Precip.</span>
                  <span className="si-weather-panel__metric-value">
                    {displayPrecip != null ? `${displayPrecip.toFixed(1)} mm` : '—'}
                  </span>
                </div>
              </div>

              {hasWeather && snapshot?.nextHours.length ? (
                <div className="si-wx-next-hours">
                  <div className="si-wx-section-label">Next hours</div>
                  <div className="si-wx-next-hours__strip">
                    {snapshot.nextHours.slice(0, 12).map(h => (
                      <div key={h.time} className="si-wx-next-hours__cell">
                        <span className="si-wx-next-hours__time">{formatHourLabel(h.time, tz)}</span>
                        <i
                          className={`${wmoWeatherIconClass(h.weatherCode)} ${wmoWeatherToneClass(h.weatherCode)}`}
                          aria-hidden
                        />
                        <span className="si-wx-next-hours__temp">
                          {h.temperatureC != null ? `${Math.round(h.temperatureC)}°` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasWeather ? (
                <div className="si-wx-temporal">
                  <div className="si-wx-section-label">Temporal comparison</div>
                  {temporalLoading ? (
                    <p className="si-wx-temporal__loading">Loading comparison…</p>
                  ) : (
                    <div className="si-wx-temporal__cards">
                      {temporalCards.map(card => (
                        <article key={card.key} className="si-wx-temporal__card">
                          <header className="si-wx-temporal__card-head">
                            <span className="si-wx-temporal__card-title">{card.title}</span>
                            <i
                              className={`si-wx-temporal__card-icon ${wmoWeatherIconClass(card.weatherCode)} ${wmoWeatherToneClass(card.weatherCode)}`}
                              aria-hidden
                            />
                          </header>
                          <div className="si-wx-temporal__card-temp">
                            {card.tempC != null ? `${Math.round(card.tempC)}°C` : '—'}
                          </div>
                          <div className="si-wx-temporal__card-cond">{card.conditionLabel}</div>
                          <dl className="si-wx-temporal__card-stats">
                            <div>
                              <dt>Wind</dt>
                              <dd>
                                {card.windSpeedKmh != null
                                  ? `${Math.round(card.windSpeedKmh)} km/h ${card.windDirectionLabel}`
                                  : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt>Humidity</dt>
                              <dd>{card.humidityPct != null ? `${Math.round(card.humidityPct)}%` : '—'}</dd>
                            </div>
                            <div>
                              <dt>Precip.</dt>
                              <dd>{card.precipMm != null ? `${card.precipMm.toFixed(1)} mm` : '—'}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {hasWeather && snapshot ? (
                <div className="si-weather-panel__compare">
                  <button
                    type="button"
                    className="si-weather-panel__compare-toggle"
                    onClick={() => setCompareOpen(o => !o)}
                    aria-expanded={compareOpen}
                  >
                    <span>7-day forecast</span>
                    <i className={`fa-solid fa-chevron-${compareOpen ? 'up' : 'down'}`} aria-hidden />
                  </button>
                  {compareOpen ? (
                    <ul className="si-weather-panel__compare-list">
                      {snapshot.daily.map(day => {
                        const isSel = day.date === selectedDate;
                        return (
                          <li key={day.date}>
                            <button
                              type="button"
                              className={isSel ? 'active' : ''}
                              onClick={() => handleDateChange(day.date)}
                            >
                              <span className="si-weather-panel__compare-date">{formatPanelDate(day.date, tz)}</span>
                              <span
                                className={`si-weather-panel__compare-icon ${wmoWeatherIconClass(day.weatherCode)} ${wmoWeatherToneClass(day.weatherCode)}`}
                              />
                              <span className="si-weather-panel__compare-temps">
                                <strong>{day.tempMaxC != null ? `${Math.round(day.tempMaxC)}°` : '—'}</strong>
                                <em>{day.tempMinC != null ? `${Math.round(day.tempMinC)}°` : '—'}</em>
                              </span>
                              <span className="si-weather-panel__compare-precip">
                                {day.precipMm != null ? `${day.precipMm.toFixed(0)} mm` : '—'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        <footer className="si-weather-panel__footer">
          <span>Open-Meteo · OpenWeather</span>
          {snapshot?.elevationM != null ? (
            <span className="si-weather-panel__elev">{Math.round(snapshot.elevationM)} m elev.</span>
          ) : null}
        </footer>

        <div
          className="si-weather-panel__resize"
          role="separator"
          aria-label="Resize card"
          title="Resize Card"
          onPointerDown={e =>
            startResize(
              e,
              panelView === 'history'
                ? compact
                  ? { minW: ACP_MIN_W, minH: ACP_HISTORY_MIN_H }
                  : { minW: HISTORY_MIN_W, minH: HISTORY_MIN_H }
                : undefined,
            )
          }
        >
          <svg viewBox="0 0 10 10" aria-hidden className="si-weather-panel__resize-grip">
            <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            <path d="M9 5v4H5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
};
