import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSiInstanceScope } from '../siInstanceScope';
import './WeatherVisualizationPanel.css';

/** A visual weather effect preset applied to the map scene. */
export type WeatherVizPresetId = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm';

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
  preset: WeatherVizPresetId | null;
  camera: WeatherVizCamera;
  createdAt: number;
};

type WeatherVizPresetDef = {
  id: WeatherVizPresetId;
  label: string;
  icon: string;
  tone: string;
};

export const WEATHER_VIZ_PRESETS: WeatherVizPresetDef[] = [
  { id: 'clear', label: 'Clear', icon: 'fa-solid fa-sun', tone: 'clear' },
  { id: 'cloudy', label: 'Cloudy', icon: 'fa-solid fa-cloud-sun', tone: 'cloud' },
  { id: 'rain', label: 'Rain', icon: 'fa-solid fa-cloud-showers-heavy', tone: 'rain' },
  { id: 'snow', label: 'Snow', icon: 'fa-solid fa-snowflake', tone: 'snow' },
  { id: 'fog', label: 'Fog', icon: 'fa-solid fa-smog', tone: 'fog' },
  { id: 'storm', label: 'Storm', icon: 'fa-solid fa-cloud-bolt', tone: 'storm' },
];

/** Mapbox GL fog presets, applied only when the active style supports `setFog`. */
const FOG_PRESETS: Record<WeatherVizPresetId, Record<string, unknown>> = {
  clear: {
    range: [1, 12],
    color: 'rgb(186, 210, 235)',
    'high-color': 'rgb(36, 92, 223)',
    'horizon-blend': 0.02,
    'space-color': 'rgb(11, 18, 38)',
    'star-intensity': 0.1,
  },
  cloudy: {
    range: [0.8, 8],
    color: 'rgb(200, 205, 212)',
    'high-color': 'rgb(120, 140, 170)',
    'horizon-blend': 0.2,
    'space-color': 'rgb(40, 46, 58)',
    'star-intensity': 0,
  },
  rain: {
    range: [0.5, 6],
    color: 'rgb(120, 132, 150)',
    'high-color': 'rgb(70, 88, 120)',
    'horizon-blend': 0.4,
    'space-color': 'rgb(24, 30, 42)',
    'star-intensity': 0,
  },
  snow: {
    range: [0.5, 7],
    color: 'rgb(224, 232, 240)',
    'high-color': 'rgb(180, 200, 220)',
    'horizon-blend': 0.5,
    'space-color': 'rgb(60, 70, 86)',
    'star-intensity': 0,
  },
  fog: {
    range: [0, 3],
    color: 'rgb(210, 214, 220)',
    'high-color': 'rgb(170, 176, 186)',
    'horizon-blend': 0.8,
    'space-color': 'rgb(120, 126, 136)',
    'star-intensity': 0,
  },
  storm: {
    range: [0.5, 5],
    color: 'rgb(86, 92, 110)',
    'high-color': 'rgb(40, 46, 66)',
    'horizon-blend': 0.5,
    'space-color': 'rgb(14, 16, 26)',
    'star-intensity': 0,
  },
};

const SLIDES_LS = 'agri_si_weather_viz_slides_v1';
const PANEL_GEOM_LS = 'agri_si_weather_viz_panel_geom_v1';
const MIN_W = 268;
const MIN_H = 220;
const DEFAULT_W = 300;
const DEFAULT_H = 360;

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
    return { x: 12, y: 120, w: DEFAULT_W, h: DEFAULT_H };
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
    y: 120,
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
    return Array.isArray(parsed) ? (parsed as WeatherVizSlide[]) : [];
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

export type WeatherVisualizationPanelProps = {
  open: boolean;
  onClose: () => void;
  preset: WeatherVizPresetId | null;
  onPresetChange: (preset: WeatherVizPresetId | null) => void;
  /** Snapshot of the current map camera (for saving a scene slide). */
  getCamera: () => WeatherVizCamera | null;
  /** Fly the map to a saved camera. */
  onApplyCamera: (camera: WeatherVizCamera) => void;
  /** Returns the underlying Mapbox/MapLibre map for atmospheric `setFog`. */
  getMap?: () => unknown;
  /** Overlay effect intensity (20–100). */
  intensity: number;
  onIntensityChange: (value: number) => void;
  onNotify?: (message: string) => void;
};

export const WeatherVisualizationPanel: React.FC<WeatherVisualizationPanelProps> = ({
  open,
  onClose,
  preset,
  onPresetChange,
  getCamera,
  onApplyCamera,
  getMap,
  intensity,
  onIntensityChange,
  onNotify,
}) => {
  const { scopedStorageKey } = useSiInstanceScope();
  const slidesLs = scopedStorageKey(SLIDES_LS);
  const panelGeomLs = scopedStorageKey(PANEL_GEOM_LS);
  const { geom, startDrag } = useVizPanelGeometry(panelGeomLs);
  const [minimized, setMinimized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  // Apply / clear the Mapbox atmospheric fog for the active preset.
  useEffect(() => {
    if (!open || !getMap) return;
    const map = getMap() as { setFog?: (fog: unknown) => void } | null;
    if (!map || typeof map.setFog !== 'function') return;
    try {
      map.setFog(preset ? FOG_PRESETS[preset] : null);
    } catch {
      /* fog unsupported on this style */
    }
  }, [open, preset, getMap]);

  // Restore the default sky/fog when the panel unmounts.
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

  const handlePresetClick = (id: WeatherVizPresetId) => {
    onPresetChange(preset === id ? null : id);
  };

  const handleSaveView = () => {
    const camera = getCamera();
    if (!camera) {
      onNotify?.('Map camera is not ready yet.');
      return;
    }
    const presetLabel = preset ? WEATHER_VIZ_PRESETS.find(p => p.id === preset)?.label : 'Clear sky';
    const slide: WeatherVizSlide = {
      id: `slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${presetLabel ?? 'Scene'} ${slides.length + 1}`,
      preset,
      camera,
      createdAt: Date.now(),
    };
    persistSlides([...slides, slide]);
    onNotify?.('Scene slide saved.');
  };

  const handlePlaySlide = (slide: WeatherVizSlide) => {
    onPresetChange(slide.preset);
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
    const payload = JSON.stringify({ kind: 'agrocloud-weather-slides', version: 1, slides }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      onNotify?.('Scene slides copied to clipboard.');
    } catch {
      onNotify?.('Could not copy to clipboard.');
    }
  };

  const handleReset = () => {
    onPresetChange(null);
    if (getMap) {
      const map = getMap() as { setFog?: (fog: unknown) => void } | null;
      try {
        map?.setFog?.(null);
      } catch {
        /* ignore */
      }
    }
    onNotify?.('Weather reset.');
  };

  if (!open) return null;

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
            <h2 className="si-wviz-title">Weather visualization</h2>
          </div>
          <div className="si-wviz-actions" data-drag-exclude>
            <button
              type="button"
              className={`si-wviz-icon-btn${settingsOpen ? ' active' : ''}`}
              title="Settings"
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen(o => !o)}
            >
              <i className="fa-solid fa-gear" aria-hidden />
            </button>
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
            {settingsOpen ? (
              <div className="si-wviz-settings">
                <label className="si-wviz-settings-row">
                  <span className="si-wviz-settings-label">Effect intensity</span>
                  <span className="si-wviz-settings-val">{intensity}%</span>
                </label>
                <input
                  type="range"
                  min={20}
                  max={100}
                  value={intensity}
                  className="si-wviz-range"
                  onChange={e => onIntensityChange(Number(e.target.value))}
                  aria-label="Effect intensity"
                />
              </div>
            ) : null}

            <section className="si-wviz-section">
              <div className="si-wviz-section-label">Weather preset</div>
              <div className="si-wviz-presets">
                {WEATHER_VIZ_PRESETS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`si-wviz-preset si-wviz-tone--${p.tone}${preset === p.id ? ' active' : ''}`}
                    title={p.label}
                    aria-pressed={preset === p.id}
                    onClick={() => handlePresetClick(p.id)}
                  >
                    <i className={p.icon} aria-hidden />
                    <span className="si-wviz-preset-label">{p.label}</span>
                  </button>
                ))}
              </div>
            </section>

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
                  {slides.map(slide => {
                    const def = slide.preset
                      ? WEATHER_VIZ_PRESETS.find(p => p.id === slide.preset)
                      : null;
                    return (
                      <li key={slide.id} className="si-wviz-slide">
                        <button
                          type="button"
                          className="si-wviz-slide-main"
                          onClick={() => handlePlaySlide(slide)}
                          title="Replay this scene"
                        >
                          <i
                            className={`si-wviz-slide-icon ${def ? def.icon : 'fa-solid fa-circle-half-stroke'}`}
                            aria-hidden
                          />
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
                    );
                  })}
                </ul>
              ) : (
                <p className="si-wviz-empty">
                  Save the current camera and weather to replay or share slides.
                </p>
              )}
            </section>

            <button type="button" className="si-wviz-reset" onClick={handleReset}>
              <i className="fa-solid fa-rotate-left" aria-hidden /> Reset weather
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/**
 * Full-bleed atmospheric overlay rendered above the map canvas. Adds tinting,
 * vignette and animated precipitation (rain / snow) for the active preset.
 * Pointer-events are disabled so map interaction is unaffected.
 */
export const WeatherVizOverlay: React.FC<{ preset: WeatherVizPresetId | null; intensity?: number }> = ({
  preset,
  intensity = 70,
}) => {
  if (!preset) return null;
  const opacity = clamp(intensity, 20, 100) / 100;
  return (
    <div className={`si-wviz-overlay si-wviz-overlay--${preset}`} style={{ opacity }} aria-hidden>
      <div className="si-wviz-overlay-tint" />
      {preset === 'rain' || preset === 'storm' ? <div className="si-wviz-overlay-rain" /> : null}
      {preset === 'snow' ? <div className="si-wviz-overlay-snow" /> : null}
      {preset === 'fog' ? <div className="si-wviz-overlay-fog" /> : null}
      {preset === 'storm' ? <div className="si-wviz-overlay-flash" /> : null}
    </div>
  );
};
