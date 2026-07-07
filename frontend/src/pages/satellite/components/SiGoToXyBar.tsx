import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMapOverlayIsolation } from '../useMapOverlayIsolation';
import {
  formatGoToXyPair,
  GO_TO_XY_FORMAT_OPTIONS,
  goToXyAxisLabels,
  goToXyFormatShortLabel,
  parseGoToXyPair,
  type GoToXyFormat,
} from '../utils/goToXyCoords';
import './SiGoToXyBar.css';

export type SiGoToXyBarProps = {
  open: boolean;
  onClose: () => void;
  longitude: number;
  latitude: number;
  onFlyTo: (lng: number, lat: number, opts?: { panOnly?: boolean }) => void;
  onPlaceMarker?: (lng: number, lat: number) => void;
  /** Extra bottom offset when timeline chrome is visible (px). */
  bottomOffset?: number;
};

export function SiGoToXyBar({
  open,
  onClose,
  longitude,
  latitude,
  onFlyTo,
  onPlaceMarker,
  bottomOffset = 12,
}: SiGoToXyBarProps) {
  const isolationProps = useMapOverlayIsolation(true, { native: true });
  const formatMenuId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const [format, setFormat] = useState<GoToXyFormat>('dd');
  const [xValue, setXValue] = useState('');
  const [yValue, setYValue] = useState('');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hintLngRef = useRef(longitude);

  const syncFieldsFromMap = useCallback(
    (lng: number, lat: number, fmt: GoToXyFormat) => {
      const pair = formatGoToXyPair(fmt, lng, lat);
      setXValue(pair.x);
      setYValue(pair.y);
      hintLngRef.current = lng;
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    syncFieldsFromMap(longitude, latitude, format);
  }, [open, longitude, latitude, format, syncFieldsFromMap]);

  const resolveCoords = useCallback((): { lng: number; lat: number } | null => {
    const parsed = parseGoToXyPair(format, xValue, yValue, hintLngRef.current);
    if (!parsed) {
      setError('Enter valid coordinates for the selected format.');
      return null;
    }
    setError(null);
    return parsed;
  }, [format, xValue, yValue]);

  const goToCoords = useCallback(
    (opts?: { panOnly?: boolean }) => {
      const parsed = resolveCoords();
      if (!parsed) return;
      onFlyTo(parsed.lng, parsed.lat, opts);
    },
    [onFlyTo, resolveCoords],
  );

  const placeMarker = useCallback(() => {
    const parsed = resolveCoords();
    if (!parsed || !onPlaceMarker) return;
    onPlaceMarker(parsed.lng, parsed.lat);
  }, [onPlaceMarker, resolveCoords]);

  const onFormatChange = (next: GoToXyFormat) => {
    const parsed = parseGoToXyPair(format, xValue, yValue, hintLngRef.current);
    const lng = parsed?.lng ?? longitude;
    const lat = parsed?.lat ?? latitude;
    setFormat(next);
    syncFieldsFromMap(lng, lat, next);
    setFormatMenuOpen(false);
  };

  if (!open) return null;

  const axis = goToXyAxisLabels(format);

  return (
    <div
      className={'si-go-to-xy' + (collapsed ? ' si-go-to-xy--collapsed' : '')}
      style={{ bottom: bottomOffset }}
      role="region"
      aria-label="Go To XY"
      {...isolationProps}
    >
      <button
        type="button"
        className="si-go-to-xy__collapse"
        title={collapsed ? 'Expand Go To XY' : 'Collapse Go To XY'}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(c => !c)}
      >
        <i className={'fa-solid ' + (collapsed ? 'fa-chevron-up' : 'fa-chevron-down')} aria-hidden />
      </button>

      {!collapsed ? (
        <div className="si-go-to-xy__body">
          <label className="si-go-to-xy__field">
            <span>{axis.x}</span>
            <input
              type="text"
              value={xValue}
              onChange={e => {
                setXValue(e.target.value);
                setError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') goToCoords({ panOnly: panMode });
              }}
              aria-label="X coordinate"
            />
          </label>
          <label className="si-go-to-xy__field">
            <span>{axis.y}</span>
            <input
              type="text"
              value={yValue}
              onChange={e => {
                setYValue(e.target.value);
                setError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') goToCoords({ panOnly: panMode });
              }}
              aria-label="Y coordinate"
            />
          </label>

          <div className="si-go-to-xy__format-wrap">
            <button
              type="button"
              className="si-go-to-xy__format-btn"
              aria-haspopup="listbox"
              aria-expanded={formatMenuOpen}
              aria-controls={formatMenuId}
              onClick={() => setFormatMenuOpen(v => !v)}
            >
              {goToXyFormatShortLabel(format)}
              <i className="fa-solid fa-chevron-down" aria-hidden />
            </button>
            {formatMenuOpen ? (
              <ul id={formatMenuId} className="si-go-to-xy__format-menu" role="listbox">
                {GO_TO_XY_FORMAT_OPTIONS.map(opt => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={format === opt.id}
                      className={'si-go-to-xy__format-opt' + (format === opt.id ? ' is-on' : '')}
                      onClick={() => onFormatChange(opt.id)}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="si-go-to-xy__actions">
            <button
              type="button"
              className="si-go-to-xy__action si-go-to-xy__action--center"
              title="Center on coordinates"
              aria-label="Center on coordinates"
              onClick={() => goToCoords()}
            >
              <i className="fa-solid fa-crosshairs" aria-hidden />
            </button>
            <button
              type="button"
              className={'si-go-to-xy__action' + (panMode ? ' is-on' : '')}
              title={panMode ? 'Pan mode on' : 'Pan to coordinates'}
              aria-label="Pan to coordinates"
              aria-pressed={panMode}
              onClick={() => {
                const next = !panMode;
                setPanMode(next);
                if (next) goToCoords({ panOnly: true });
              }}
            >
              <i className="fa-regular fa-hand" aria-hidden />
            </button>
            {onPlaceMarker ? (
              <button
                type="button"
                className="si-go-to-xy__action si-go-to-xy__action--marker is-on"
                title="Place marker at coordinates"
                aria-label="Place marker at coordinates"
                onClick={placeMarker}
              >
                <i className="fa-solid fa-location-dot" aria-hidden />
                <i className="fa-solid fa-chevron-down si-go-to-xy__marker-caret" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="si-go-to-xy__action si-go-to-xy__action--close"
              title="Close Go To XY"
              aria-label="Close Go To XY"
              onClick={onClose}
            >
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="si-go-to-xy__error">{error}</p> : null}
    </div>
  );
}
