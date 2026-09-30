/**
 * Prevent Mapbox GL from receiving color paint values that evaluate to null or to a
 * non-color value at render time.
 *
 * Why this matters: paint color expressions that fail evaluation fall back to the
 * property's spec default — but `fill-outline-color` has NO spec default, so a failed
 * evaluation yields `null` and Mapbox crashes with
 * `Cannot read properties of null (reading 'toPremultipliedRenderColor')`.
 *
 * Note `coalesce` is NOT a sufficient guard: Mapbox parses coalesce arguments without
 * type annotation, so `['coalesce', ['get', 'x'], '#fff']` returns the raw property value
 * (e.g. the number 123) un-coerced, and the outer color coercion then throws. `to-color`
 * is the correct guard — it returns the first argument that successfully converts to a
 * color, skipping nulls and invalid values.
 */

export const MAPBOX_SAFE_FALLBACK_COLOR = 'rgba(0,0,0,0)';

const COLOR_PAINT_PROPS = new Set([
  'fill-color',
  'fill-outline-color',
  'line-color',
  'circle-color',
  'circle-stroke-color',
  'icon-color',
  'text-color',
  'text-halo-color',
]);

export function isMapboxColorPaintProperty(name: string): boolean {
  return COLOR_PAINT_PROPS.has(name);
}

function isValidColorLiteral(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (!s) return false;
  if (s === 'null' || s === 'undefined') return false;
  return true;
}

function sanitizeColor(value: unknown, fallback: string, wrapDataDriven: boolean): unknown {
  if (value === null || value === undefined) return fallback;
  if (isValidColorLiteral(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!Array.isArray(value)) return value;

  const op = value[0];
  if (op === 'match') {
    const out = [...value];
    for (let i = 2; i < out.length - 1; i += 2) {
      out[i + 1] = sanitizeColor(out[i + 1], fallback, wrapDataDriven);
    }
    out[out.length - 1] = sanitizeColor(out[out.length - 1], fallback, wrapDataDriven);
    return out;
  }
  if (op === 'case') {
    const out = [...value];
    for (let i = 1; i < out.length - 1; i += 2) {
      out[i + 1] = sanitizeColor(out[i + 1], fallback, wrapDataDriven);
    }
    out[out.length - 1] = sanitizeColor(out[out.length - 1], fallback, wrapDataDriven);
    return out;
  }
  if (op === 'step') {
    const out = [...value];
    if (out.length >= 3) out[2] = sanitizeColor(out[2], fallback, wrapDataDriven);
    for (let i = 3; i < out.length - 1; i += 2) {
      out[i + 1] = sanitizeColor(out[i + 1], fallback, wrapDataDriven);
    }
    return out;
  }
  if (op === 'interpolate') {
    const out = [...value];
    for (let i = 3; i < out.length - 1; i += 2) {
      out[i + 1] = sanitizeColor(out[i + 1], fallback, wrapDataDriven);
    }
    return out;
  }
  if (op === 'get' || op === 'feature-state') {
    // to-color skips values that fail color conversion; coalesce would leak them through.
    return wrapDataDriven ? ['to-color', value, fallback] : value;
  }
  if (op === 'coalesce') {
    // Keep the fallback-chain semantics but add per-argument color validation:
    // inner args stay unwrapped so to-color can try the next one on failure.
    const args = value.slice(1).map(v => sanitizeColor(v, fallback, false));
    // interpolate can't parse in a value-typed (to-color argument) position.
    const hasInterpolate = args.some(a => Array.isArray(a) && a[0] === 'interpolate');
    if (!wrapDataDriven || hasInterpolate) {
      const out: unknown[] = ['coalesce', ...args];
      const last = out[out.length - 1];
      if (!isValidColorLiteral(last)) out.push(fallback);
      return out;
    }
    const out: unknown[] = ['to-color', ...args];
    const last = out[out.length - 1];
    if (!isValidColorLiteral(last)) out.push(fallback);
    return out;
  }
  if (op === 'to-color') {
    const out = [...value];
    const last = out[out.length - 1];
    if (out.length < 2 || !isValidColorLiteral(last)) out.push(fallback);
    return out;
  }
  if (op === 'rgba' || op === 'rgb' || op === 'hsl' || op === 'hsla') {
    return value;
  }
  // Unknown operator: only replace nulls in nested values, never wrap sub-expressions
  // (they may not be color-typed positions).
  return value.map((v, i) => (i === 0 ? v : sanitizeColor(v, fallback, false)));
}

/** Recursively replace null/invalid branch outputs in Mapbox color expressions. */
export function sanitizeMapboxColorExpression(value: unknown, fallback = MAPBOX_SAFE_FALLBACK_COLOR): unknown {
  return sanitizeColor(value, fallback, true);
}

export function sanitizeMapboxPaint(
  paint: Record<string, unknown> | null | undefined,
  fallback = MAPBOX_SAFE_FALLBACK_COLOR,
): Record<string, unknown> {
  if (!paint || typeof paint !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(paint)) {
    if (isMapboxColorPaintProperty(key)) {
      out[key] = sanitizeMapboxColorExpression(value, fallback);
    } else {
      out[key] = value;
    }
  }
  return out;
}
