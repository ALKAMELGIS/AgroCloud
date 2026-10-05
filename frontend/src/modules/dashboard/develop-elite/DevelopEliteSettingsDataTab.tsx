import type { DevelopEliteDashboardConfig } from './developEliteDashboardConfig'
import {
  DEVELOP_ELITE_DATA_SOURCE_GROUPS,
  developEliteArcGisUrlShortLabel,
  developEliteDataSourceGeometryLabel,
  developEliteDataSourceKindLabel,
  developEliteDataSourcesByGroup,
  patchDevelopEliteDataSourceUrl,
  type DevelopEliteDataSourceDef,
  type DevelopEliteDataSourceUrlKey,
} from './developEliteDataSourceRegistry'

type Props = {
  draft: DevelopEliteDashboardConfig
  onChange: (next: DevelopEliteDashboardConfig) => void
}

function DataLayerCard({
  def,
  url,
  onUrlChange,
  onResetDefault,
}: {
  def: DevelopEliteDataSourceDef
  url: string
  onUrlChange: (url: string) => void
  onResetDefault: () => void
}) {
  const trimmed = url.trim()
  const serviceLabel = developEliteArcGisUrlShortLabel(trimmed || def.defaultUrl)
  const isDefault = trimmed === def.defaultUrl || (!trimmed && def.defaultUrl)

  return (
    <article className="develop-elite-settings__data-layer">
      <header className="develop-elite-settings__data-layer-head">
        <div className="develop-elite-settings__data-layer-titles">
          <h4 className="develop-elite-settings__data-layer-title">{def.title}</h4>
          <p className="develop-elite-settings__data-layer-desc">{def.description}</p>
        </div>
        <div className="develop-elite-settings__data-layer-badges" aria-hidden>
          <span className="develop-elite-settings__data-badge">{developEliteDataSourceKindLabel(def.kind)}</span>
          <span className="develop-elite-settings__data-badge develop-elite-settings__data-badge--muted">
            {developEliteDataSourceGeometryLabel(def.geometry)}
          </span>
          {def.mapLayerId ? (
            <span className="develop-elite-settings__data-badge develop-elite-settings__data-badge--accent">
              Layers panel
            </span>
          ) : null}
        </div>
      </header>
      <div className="develop-elite-settings__data-layer-service" title={trimmed || def.defaultUrl}>
        <i className="fa-solid fa-layer-group" aria-hidden />
        <code>{serviceLabel}</code>
      </div>
      <label className="develop-elite-settings__data-layer-url">
        <span className="visually-hidden">REST URL for {def.title}</span>
        <input
          type="url"
          value={url}
          placeholder={def.defaultUrl}
          spellCheck={false}
          autoComplete="off"
          onChange={e => onUrlChange(e.target.value)}
        />
      </label>
      <div className="develop-elite-settings__data-layer-actions">
        <button
          type="button"
          className="develop-elite-settings__data-link"
          disabled={isDefault}
          onClick={onResetDefault}
        >
          Reset URL
        </button>
        {trimmed ? (
          <a
            className="develop-elite-settings__data-link"
            href={trimmed}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open REST
          </a>
        ) : null}
      </div>
    </article>
  )
}

export function DevelopEliteSettingsDataTab({ draft, onChange }: Props) {
  const setUrl = (key: DevelopEliteDataSourceUrlKey, url: string) => {
    onChange(patchDevelopEliteDataSourceUrl(draft, key, url))
  }

  const resetUrl = (def: DevelopEliteDataSourceDef) => {
    onChange(patchDevelopEliteDataSourceUrl(draft, def.key, def.defaultUrl))
  }

  return (
    <div className="develop-elite-settings__data">
      <p className="develop-elite-settings__data-lead">
        ArcGIS FeatureServer and table endpoints. Changes apply after <strong>Save &amp; reload</strong>.
        Map visibility and draw order are in the <strong>Map Layer</strong> tab.
      </p>

      <div className="develop-elite-settings__data-groups">
        {DEVELOP_ELITE_DATA_SOURCE_GROUPS.map(group => {
          const sources = developEliteDataSourcesByGroup(group.id)
          if (!sources.length) return null
          return (
            <details
              key={group.id}
              className="develop-elite-settings__data-group"
              open={group.defaultOpen ?? false}
            >
              <summary className="develop-elite-settings__data-group-summary">
                <span className="develop-elite-settings__data-group-title">{group.title}</span>
                <span className="develop-elite-settings__data-group-count">{sources.length} sources</span>
              </summary>
              <p className="develop-elite-settings__data-group-desc">{group.description}</p>
              <div className="develop-elite-settings__data-group-list">
                {sources.map(def => (
                  <DataLayerCard
                    key={def.key}
                    def={def}
                    url={String(draft[def.key] ?? '')}
                    onUrlChange={url => setUrl(def.key, url)}
                    onResetDefault={() => resetUrl(def)}
                  />
                ))}
              </div>
            </details>
          )
        })}
      </div>

      <section className="develop-elite-settings__data-joins" aria-labelledby="de-settings-joins-title">
        <h3 id="de-settings-joins-title" className="develop-elite-settings__data-joins-title">
          Joins &amp; labels
        </h3>
        <label className="develop-elite-settings__field develop-elite-settings__field--compact">
          <span>Structure ↔ crops join field</span>
          <input
            type="text"
            value={draft.cropStructureJoinField}
            onChange={e => onChange({ ...draft, cropStructureJoinField: e.target.value })}
          />
        </label>
        <p className="develop-elite-settings__hint develop-elite-settings__hint--tight">
          Crops table joins to structures on this field (default <strong>Farm_Code</strong>). Zone list uses
          the zones layer <strong>Name</strong> field.
        </p>
        <label className="develop-elite-settings__field develop-elite-settings__field--compact">
          <span>Wildlife project label (AgroLocation filter)</span>
          <input
            type="text"
            value={draft.wildfelidProjectMatch}
            onChange={e => onChange({ ...draft, wildfelidProjectMatch: e.target.value })}
          />
        </label>
      </section>
    </div>
  )
}
