import { DEVELOP_ELITE_GLOBE_COCKPIT_TAB_ENABLED } from './developEliteDashboardConfig'

export type DevelopEliteMapCanvasTab = 'portfolio' | 'globe-cockpit'

type Props = {
  value: DevelopEliteMapCanvasTab
  onChange: (tab: DevelopEliteMapCanvasTab) => void
}

export function DevelopEliteMapViewportTabs({ value, onChange }: Props) {
  if (!DEVELOP_ELITE_GLOBE_COCKPIT_TAB_ENABLED) return null

  return (
    <div className="develop-elite-map__canvas-tabs" role="tablist" aria-label="Map view">      <button
        type="button"
        role="tab"
        id="de-map-tab-portfolio"
        aria-selected={value === 'portfolio'}
        aria-controls="de-map-pane-portfolio"
        className={`develop-elite-map__canvas-tab${value === 'portfolio' ? ' is-active' : ''}`}
        onClick={() => onChange('portfolio')}
      >
        <i className="fa-solid fa-map" aria-hidden />
        <span>Portfolio</span>
      </button>
      <button
        type="button"
        role="tab"
        id="de-map-tab-globe"
        aria-selected={value === 'globe-cockpit'}
        aria-controls="de-map-pane-globe"
        className={`develop-elite-map__canvas-tab${value === 'globe-cockpit' ? ' is-active' : ''}`}
        onClick={() => onChange('globe-cockpit')}
      >
        <i className="fa-solid fa-earth-americas" aria-hidden />
        <span>Globe</span>
      </button>
    </div>
  )
}
