import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSiInstanceScope } from '../siInstanceScope';
import {
  DEFAULT_WEATHER_SIM,
  WEATHER_SIM_LIMITS,
  WEATHER_SIM_PRESETS,
  WEATHER_SIM_PRESET_ORDER,
  describeWeatherSim,
  normalizeWeatherSim,
  weatherSimMatchesPreset,
  weatherSimToMapboxFog,
  windCompass,
  type WeatherSimState,
  type WeatherVizPresetId,
} from './weatherSimModel';
import './WeatherVisualizationPanel.css';

export type { WeatherVizPresetId, WeatherSimState } from './weatherSimModel';
export { DEFAULT_WEATHER_SIM, normalizeWeatherSim } from './weatherSimModel';
export { WeatherVizOverlay } from './WeatherVizOverlay';

/** Camera + weather snapshot that can be replayed or shared. */
export type WeatherVizCamera = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

export type WeatherVizSlide = {
  id: string;
  name: string;
  sim: WeatherSimState;
  camera: WeatherVizCamera;
  createdAt: number;
  /** Legacy field kept for backward compatibility with v1 slides. */
  preset?: WeatherVizPresetId | null;
};

const SLIDES_LS = 'agri_si_weather_viz_slides_v1';
const PANEL_GEOM_LS = 'agri_si_weather_viz_panel_geom_v1';
const MIN_W = 286;
const MIN_H = 240;
const DEFAULT_W = 320;
const DEFAULT_H = 540;

type PanelGeom = { x: number; y: number; w: number; h: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function clampGeomToViewport(g: PanelGeom): PanelGeom {
  if (typeof window === 'undefined') return g;
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const availW = Math.max(160, vw - margin * 2);
  const availH = Math.max(160, vh - margin * 2);
  const w = clamp(g.w, Math.min(MIN_W, availW), availW);
  const h = clamp(g.h, Math.min(MIN_H, availH), availH);
  const x = clamp(g.x, margin, Math.max(margin, vw - w - margin));
  const y = clamp(g.y, margin, Math.max(margin, vh - h - margin));
  return { x, y, w, h };
}

function readPanelGeom(storageKey: string): PanelGeom {
  if (typeof window === 'undefined') {
    return { x: 12, y: 100, w: DEFAULT_W, h: DEFAULT_H };
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const p = JSON.parse(raw) as PanelGeom;
      if ([p.x, p.y, p.w, p.h].every(Number.isFinite)) return clampGeomToViewport(p);
    }
  } catch {
    /* ignore */
  }
  return clampGeomToViewport({
    x: Math.max(8, window.innerWidth - DEFAULT_W - 16),
    y: 96,
    w: DEFAULT_W,
    h: DEFAULT_H,
  });
}

function readSlides(storageKey: string): WeatherVizSlide[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as WeatherVizSlide[]).map(slide => {
      // Migrate legacy preset-only slides into a full simulation snapshot.
      if (!slide.sim && slide.preset) {
        return {
          ...slide,
          sim: normalizeWeatherSim(WEATHER_SIM_PRESETS[slide.preset]?.patch),
        };
      }
      return { ...slide, sim: normalizeWeatherSim(slide.sim) };
    });
  } catch {
    return [];
  }
}

function useVizPanelGeometry(storageKey: string) {
  const [geom, setGeom] = useState<PanelGeom>(() => readPanelGeom(storageKey));
  const geomRef = useRef(geom);
  geomRef.current = geom;

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(geomRef.current));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  useEffect(() => {
    const onResize = () => setGeom(prev => clampGeomToViewport(prev));
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, a, [data-drag-exclude]')) return;
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

  return { geom, startDrag };
}

/* ───────────────────────────── Sub-controls ───────────────────────────── */

type SimSliderProps = {
  label: string;
  icon: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  accent?: string;
  display?: (v: number) => string;
  onChange: (v: number) => void;
};

const SimSlider: React.FC<SimSliderProps> = ({
  label,
  icon,
  value,
  min,
  max,
  step = 1,
  unit = '',
  accent,
  display,
  onChange,
}) => {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="si-wviz-ctl">
      <div className="si-wviz-ctl-head">
        <span className="si-wviz-ctl-label">
          <i className={icon} aria-hidden /> {label}
        </span>
        <span className="si-wviz-ctl-val">{display ? display(value) : `${value}${unit}`}</span>
      </div>
      <input
        type="range"
        className="si-wviz-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        style={
          accent
            ? ({
                accentColor: accent,
                '--si-wviz-fill': accent,
                '--si-wviz-pct': `${pct}%`,
              } as React.CSSProperties)
            : ({ '--si-wviz-pct': `${pct}%` } as React.CSSProperties)
        }
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
};

/** Circular compass dial for wind direction (drag the handle to aim). */
const WindDial: React.FC<{ value: number; speed: number; onChange: (deg: number) => void }> = ({
  value,
  speed,
  onChange,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  const setFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      // Meteorological bearing: 0 = up (N), increases clockwise.
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      onChange(((Math.round(deg) % 360) + 360) % 360);
    },
    [onChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      setFromPointer(e.clientX, e.clientY);
      const onMove = (ev: PointerEvent) => setFromPointer(ev.clientX, ev.clientY);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [setFromPointer],
  );

  return (
    <div className="si-wviz-wind">
      <div
        ref={ref}
        className="si-wviz-dial"
        role="slider"
        aria-label="Wind direction"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(((value - 5 + 360) % 360));
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange((value + 5) % 360);
        }}
        data-drag-exclude
      >
        <span className="si-wviz-dial-tick si-wviz-dial-tick--n">N</span>
        <span className="si-wviz-dial-tick si-wviz-dial-tick--e">E</span>
        <span className="si-wviz-dial-tick si-wviz-dial-tick--s">S</span>
        <span className="si-wviz-dial-tick si-wviz-dial-tick--w">W</span>
        {/* The arrow points along the flow (from the source toward centre). */}
        <span className="si-wviz-dial-arrow" style={{ transform: `rotate(${value + 180}deg)` }}>
          <i className="fa-solid fa-location-arrow" aria-hidden />
        </span>
        <span className="si-wviz-dial-hub" />
      </div>
      <div className="si-wviz-wind-readout">
        <div className="si-wviz-wind-big">
          {windCompass(value)} <span className="si-wviz-wind-deg">{Math.round(value)}°</span>
        </div>
        <div className="si-wviz-wind-sub">{Math.round(speed)} km/h</div>
      </div>
    </div>
  );
};

/* ───────────────────────────── Panel ───────────────────────────── */

export type WeatherVisualizationPanelProps = {
  open: boolean;
  onClose: () => void;
  sim: WeatherSimState;
  onChange: (patch: Partial<WeatherSimState>) => void;
  onReset: () => void;
  /** Snapshot of the current map camera (for saving a scene slide). */
  getCamera: () => WeatherVizCamera | null;
  /** Fly the map to a saved camera. */
  onApplyCamera: (camera: WeatherVizCamera) => void;
  /** Returns the underlying Mapbox/MapLibre map for atmospheric `setFog`. */
  getMap?: () => unknown;
  onNotify?: (message: string) => void;
};

export const WeatherVisualizationPanel: React.FC<WeatherVisualizationPanelProps> = ({
  open,
  onClose,
  sim,
  onChange,
  onReset,
  getCamera,
  onApplyCamera,
  getMap,
  onNotify,
}) => {
  const { scopedStorageKey } = useSiInstanceScope();
  const slidesLs = scopedStorageKey(SLIDES_LS);
  const panelGeomLs = scopedStorageKey(PANEL_GEOM_LS);
  const { geom, startDrag } = useVizPanelGeometry(panelGeomLs);
  const [minimized, setMinimized] = useState(false);
  const [slides, setSlides] = useState<WeatherVizSlide[]>(() => readSlides(slidesLs));

  const persistSlides = useCallback(
    (next: WeatherVizSlide[]) => {
      setSlides(next);
      try {
        window.localStorage.setItem(slidesLs, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [slidesLs],
  );

  // Mirror the simulation into the globe's atmospheric fog (best-effort — the
  // base map may re-assert its own cockpit fog, in which case the canvas overlay
  // remains the authoritative visual channel).
  useEffect(() => {
    if (!open || !getMap) return;
    const map = getMap() as { setFog?: (fog: unknown) => void } | null;
    if (!map || typeof map.setFog !== 'function') return;
    const t = window.setTimeout(() => {
      try {
        map.setFog(weatherSimToMapboxFog(sim));
      } catch {
        /* fog unsupported on this style */
      }
    }, 60);
    return () => window.clearTimeout(t);
  }, [open, sim, getMap]);

  useEffect(() => {
    return () => {
      if (!getMap) return;
      const map = getMap() as { setFog?: (fog: unknown) => void } | null;
      try {
        map?.setFog?.(null);
      } catch {
        /* ignore */
      }
    };
  }, [getMap]);

  const applyPreset = (id: WeatherVizPresetId) => {
    onChange({ ...WEATHER_SIM_PRESETS[id].patch, playing: true });
  };

  const handleSaveView = () => {
    const camera = getCamera();
    if (!camera) {
      onNotify?.('Map camera is not ready yet.');
      return;
    }
    const slide: WeatherVizSlide = {
      id: `slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${describeWeatherSim(sim)}`,
      sim: { ...sim },
      camera,
      createdAt: Date.now(),
    };
    persistSlides([...slides, slide]);
    onNotify?.('Scene slide saved.');
  };

  const handlePlaySlide = (slide: WeatherVizSlide) => {
    onChange({ ...normalizeWeatherSim(slide.sim), playing: true });
    onApplyCamera(slide.camera);
  };

  const handleDeleteSlide = (id: string) => {
    persistSlides(slides.filter(s => s.id !== id));
  };

  const handleShare = async () => {
    if (!slides.length) {
      onNotify?.('Save a scene slide first to share it.');
      return;
    }
    const payload = JSON.stringify({ kind: 'agrocloud-weather-slides', version: 2, slides }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      onNotify?.('Scene slides copied to clipboard.');
    } catch {
      onNotify?.('Could not copy to clipboard.');
    }
  };

  if (!open) return null;

  const tempLimits = WEATHER_SIM_LIMITS.temperatureC;
  const windLimits = WEATHER_SIM_LIMITS.windSpeed;
  const speedLimits = WEATHER_SIM_LIMITS.speed;

  return (
    <div
      className="si-wviz-shell"
      style={{ left: geom.x, top: geom.y, width: geom.w, height: minimized ? undefined : geom.h }}
      role="dialog"
      aria-label="Weather visualization"
    >
      <div className={`si-wviz-panel${minimized ? ' si-wviz-panel--min' : ''}`}>
        <header className="si-wviz-header si-wviz-drag" onPointerDown={startDrag} title="Drag to move">
          <div className="si-wviz-brand">
            <span className="si-wviz-brand-icon" aria-hidden>
              <i className="fa-solid fa-cloud-sun-rain" />
            </span>
            <div className="si-wviz-brand-text">
              <h2 className="si-wviz-title">Weather simulation</h2>
              <span className="si-wviz-subtitle">{describeWeatherSim(sim)}</span>
            </div>
          </div>
          <div className="si-wviz-actions" data-drag-exclude>
            <button
              type="button"
              className="si-wviz-icon-btn"
              title={minimized ? 'Expand' : 'Minimize'}
              onClick={() => setMinimized(m => !m)}
            >
              <i className={`fa-solid ${minimized ? 'fa-window-maximize' : 'fa-window-minimize'}`} aria-hidden />
            </button>
            <button type="button" className="si-wviz-icon-btn" title="Close" onClick={onClose}>
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        </header>

        {!minimized ? (
          <div className="si-wviz-body">
            {/* Transport */}
            <div className="si-wviz-transport">
              <button
                type="button"
                className={`si-wviz-play${sim.playing ? ' is-playing' : ''}`}
                onClick={() => onChange({ playing: !sim.playing })}
                title={sim.playing ? 'Pause simulation' : 'Play simulation'}
                aria-pressed={sim.playing}
              >
                <i className={`fa-solid ${sim.playing ? 'fa-pause' : 'fa-play'}`} aria-hidden />
                <span>{sim.playing ? 'Pause' : 'Play'}</span>
              </button>
              <button
                type="button"
                className="si-wviz-transport-btn"
                onClick={onReset}
                title="Reset to a calm clear sky"
              >
                <i className="fa-solid fa-rotate-left" aria-hidden />
                <span>Reset</span>
              </button>
              <div className="si-wviz-speedpill" title="Animation speed">
                <i className="fa-solid fa-gauge-high" aria-hidden />
                {sim.speed.toFixed(2)}×
              </div>
            </div>

            {/* Presets */}
            <section className="si-wviz-section">
              <div className="si-wviz-section-label">Weather preset</div>
              <div className="si-wviz-presets">
                {WEATHER_SIM_PRESET_ORDER.map(id => {
                  const p = WEATHER_SIM_PRESETS[id];
                  const active = weatherSimMatchesPreset(sim, id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`si-wviz-preset si-wviz-tone--${p.tone}${active ? ' active' : ''}`}
                      title={p.label}
                      aria-pressed={active}
                      onClick={() => applyPreset(id)}
                    >
                      <i className={p.icon} aria-hidden />
                      <span className="si-wviz-preset-label">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Precipitation & storm */}
            <section className="si-wviz-section">
              <div className="si-wviz-section-label">Precipitation &amp; storm</div>
              <SimSlider
                label="Rain intensity"
                icon="fa-solid fa-cloud-rain"
                accent="#60a5fa"
                value={sim.rain}
                min={0}
                max={100}
                unit="%"
                onChange={v => onChange({ rain: v })}
              />
              <SimSlider
                label="Snow intensity"
                icon="fa-solid fa-snowflake"
                accent="#e0f2fe"
                value={sim.snow}
                min={0}
                max={100}
                unit="%"
                onChange={v => onChange({ snow: v })}
              />
              <SimSlider
                label="Storm intensity"
                icon="fa-solid fa-wind"
                accent="#a78bfa"
                value={sim.storm}
                min={0}
                max={100}
                unit="%"
                onChange={v => onChange({ storm: v })}
              />
              <SimSlider
                label="Thunderstorm"
                icon="fa-solid fa-bolt"
                accent="#fcd34d"
                value={sim.thunder}
                min={0}
                max={100}
                unit="%"
                onChange={v => onChange({ thunder: v })}
              />
            </section>

            {/* Atmosphere */}
            <section className="si-wviz-section">
              <div className="si-wviz-section-label">Atmosphere</div>
              <SimSlider
                label="Cloud coverage"
                icon="fa-solid fa-cloud"
                accent="#cbd5f5"
                value={sim.cloud}
                min={0}
                max={100}
                unit="%"
                onChange={v => onChange({ cloud: v })}
              />
              <SimSlider
                label="Fog density"
                icon="fa-solid fa-smog"
                accent="#e2e8f0"
                value={sim.fog}
                min={0}
                max={100}
                unit="%"
                onChange={v => onChange({ fog: v })}
              />
              <SimSlider
                label="Temperature"
                icon="fa-solid fa-temperature-half"
                accent={sim.temperatureC <= 2 ? '#7dd3fc' : sim.temperatureC >= 30 ? '#fb923c' : '#34d399'}
                value={sim.temperatureC}
                min={tempLimits.min}
                max={tempLimits.max}
                display={v => `${Math.round(v)} °C`}
                onChange={v => onChange({ temperatureC: v })}
              />
            </section>

            {/* Wind */}
            <section className="si-wviz-section">
              <div className="si-wviz-section-label">Wind</div>
              <WindDial
                value={sim.windDirection}
                speed={sim.windSpeed}
                onChange={deg => onChange({ windDirection: deg })}
              />
              <SimSlider
                label="Wind speed"
                icon="fa-solid fa-wind"
                accent="#5eead4"
                value={sim.windSpeed}
                min={windLimits.min}
                max={windLimits.max}
                display={v => `${Math.round(v)} km/h`}
                onChange={v => onChange({ windSpeed: v })}
              />
            </section>

            {/* Animation */}
            <section className="si-wviz-section">
              <div className="si-wviz-section-label">Animation</div>
              <SimSlider
                label="Animation speed"
                icon="fa-solid fa-gauge-high"
                accent="#f472b6"
                value={sim.speed}
                min={speedLimits.min}
                max={speedLimits.max}
                step={0.05}
                display={v => `${v.toFixed(2)}×`}
                onChange={v => onChange({ speed: v })}
              />
            </section>

            {/* Scene slides */}
            <section className="si-wviz-section si-wviz-section--slides">
              <div className="si-wviz-section-head">
                <span className="si-wviz-section-label">Scene slides</span>
                <div className="si-wviz-section-tools">
                  <button type="button" className="si-wviz-link" onClick={handleSaveView}>
                    Save view
                  </button>
                  <button type="button" className="si-wviz-link" onClick={() => void handleShare()}>
                    Share
                  </button>
                </div>
              </div>

              {slides.length ? (
                <ul className="si-wviz-slides">
                  {slides.map(slide => (
                    <li key={slide.id} className="si-wviz-slide">
                      <button
                        type="button"
                        className="si-wviz-slide-main"
                        onClick={() => handlePlaySlide(slide)}
                        title="Replay this scene"
                      >
                        <i className="si-wviz-slide-icon fa-solid fa-clapperboard" aria-hidden />
                        <span className="si-wviz-slide-name">{slide.name}</span>
                        <i className="fa-solid fa-play si-wviz-slide-play" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="si-wviz-slide-del"
                        title="Delete slide"
                        aria-label={`Delete ${slide.name}`}
                        onClick={() => handleDeleteSlide(slide.id)}
                      >
                        <i className="fa-solid fa-trash-can" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="si-wviz-empty">
                  Save the current camera and weather to replay or share slides.
                </p>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
};
