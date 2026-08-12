/**
 * ArcGIS Pro–style editable Classes table for Unique Values / Graduated Colors.
 */

import type { SymbologyClassOverride, SymbologyBreakOverride } from './LayerManager';
import type { SymbologyContext } from '../symbologyHelpers';
import './SiSymbologyClassesTable.css';

export type SiSymbologyClassesTableProps = {
  mode: 'unique' | 'graduated';
  symbologyCtx: SymbologyContext | null;
  classOverrides?: Record<string, SymbologyClassOverride>;
  breakOverrides?: SymbologyBreakOverride[];
  onClassOverrideChange: (valueKey: string, patch: SymbologyClassOverride) => void;
  onBreakOverrideChange: (index: number, patch: SymbologyBreakOverride) => void;
};

export function SiSymbologyClassesTable({
  mode,
  symbologyCtx,
  classOverrides = {},
  breakOverrides = [],
  onClassOverrideChange,
  onBreakOverrideChange,
}: SiSymbologyClassesTableProps) {
  if (!symbologyCtx) {
    return <p className="si-sym-classes__empty">Select a field to populate classes.</p>;
  }

  if (mode === 'unique') {
    const cats = symbologyCtx.categories;
    if (!cats.length) {
      return <p className="si-sym-classes__empty">No categorical values found for this field.</p>;
    }
    return (
      <div className="si-sym-classes">
        <table className="si-sym-classes__table">
          <thead>
            <tr>
              <th scope="col" aria-label="Visible" />
              <th scope="col">Symbol</th>
              <th scope="col">Value</th>
              <th scope="col">Label</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(val => {
              const ov = classOverrides[val] ?? {};
              const hidden = ov.visible === false;
              const color = ov.color ?? symbologyCtx.categoryColors[val] ?? symbologyCtx.otherColor;
              const label = ov.label ?? symbologyCtx.categoryLabels[val] ?? val;
              const count = symbologyCtx.categoryCounts[val] ?? 0;
              return (
                <tr key={val} className={hidden ? 'is-hidden' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!hidden}
                      aria-label={`Show class ${val}`}
                      onChange={e => onClassOverrideChange(val, { ...ov, visible: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="color"
                      className="si-sym-classes__swatch-input"
                      value={color.startsWith('#') ? color : '#94a3b8'}
                      aria-label={`Color for ${val}`}
                      onChange={e => onClassOverrideChange(val, { ...ov, color: e.target.value })}
                    />
                  </td>
                  <td className="si-sym-classes__value" title={val}>
                    {val}
                  </td>
                  <td>
                    <input
                      type="text"
                      className="si-sym-classes__label-input"
                      value={label}
                      aria-label={`Label for ${val}`}
                      onChange={e => onClassOverrideChange(val, { ...ov, label: e.target.value })}
                    />
                  </td>
                  <td className="si-sym-classes__count">{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const { breaks, colors } = symbologyCtx;
  if (breaks.length < 2) {
    return <p className="si-sym-classes__empty">Need numeric values to build graduated classes.</p>;
  }
  const classCount = Math.min(colors.length, breaks.length - 1);
  return (
    <div className="si-sym-classes">
      <table className="si-sym-classes__table">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Range</th>
            <th scope="col">Label</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: classCount }, (_, i) => {
            const lo = breaks[i]!;
            const hi = breaks[i + 1]!;
            const ov = breakOverrides[i] ?? { min: lo, max: hi };
            const color = ov.color ?? colors[i] ?? symbologyCtx.otherColor;
            const label = ov.label ?? symbologyCtx.breakLabels[i] ?? `${lo.toFixed(2)} – ${hi.toFixed(2)}`;
            return (
              <tr key={i}>
                <td>
                  <input
                    type="color"
                    className="si-sym-classes__swatch-input"
                    value={color.startsWith('#') ? color : '#94a3b8'}
                    aria-label={`Color for class ${i + 1}`}
                    onChange={e =>
                      onBreakOverrideChange(i, { min: lo, max: hi, ...ov, color: e.target.value })
                    }
                  />
                </td>
                <td className="si-sym-classes__range">
                  {lo.toFixed(2)} – {hi.toFixed(2)}
                </td>
                <td>
                  <input
                    type="text"
                    className="si-sym-classes__label-input"
                    value={label}
                    aria-label={`Label for class ${i + 1}`}
                    onChange={e =>
                      onBreakOverrideChange(i, { min: lo, max: hi, ...ov, label: e.target.value })
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
