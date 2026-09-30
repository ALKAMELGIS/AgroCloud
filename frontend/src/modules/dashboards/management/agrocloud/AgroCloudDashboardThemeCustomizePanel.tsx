import { useState, type Dispatch, type ReactNode, SetStateAction } from 'react'
import type { AgroCloudDashboardConfig } from './agroCloudDashboardData'
import {
  AGROCLOUD_DASHBOARD_THEMES,
  resolveAgroCloudThemeCustom,
  type AgroCloudDashboardThemeCustom,
} from './agroCloudDashboardTheme'

type Props = {
  config: AgroCloudDashboardConfig
  onConfigChange: Dispatch<SetStateAction<AgroCloudDashboardConfig>>
  onBack: () => void
}

type SectionId =
  | 'mode'
  | 'colors'
  | 'typography'
  | 'background'
  | 'widgets'
  | 'effects'
  | 'header'
  | 'brand'

function patchThemeCustom(
  config: AgroCloudDashboardConfig,
  patch: Partial<AgroCloudDashboardThemeCustom>,
): AgroCloudDashboardConfig {
  return {
    ...config,
    themeCustom: { ...resolveAgroCloudThemeCustom(config.theme, config.themeCustom), ...patch },
  }
}

export function AgroCloudDashboardThemeCustomizePanel({ config, onConfigChange, onBack }: Props) {
  const [openSection, setOpenSection] = useState<SectionId>('mode')
  const themeLabel = AGROCLOUD_DASHBOARD_THEMES.find(t => t.id === config.theme)?.label ?? config.theme
  const custom = resolveAgroCloudThemeCustom(config.theme, config.themeCustom)

  const toggle = (id: SectionId) => setOpenSection(prev => (prev === id ? prev : id))

  const update = (patch: Partial<AgroCloudDashboardThemeCustom>) => {
    onConfigChange(prev => patchThemeCustom(prev, patch))
  }

  const reset = () => {
    onConfigChange(prev => ({ ...prev, themeCustom: undefined }))
  }

  return (
    <>
      <button type="button" className="agrocloud-dashboard-editor__theme-customize-back" onClick={onBack}>
        <i className="fa-solid fa-chevron-left" aria-hidden />
        Back to themes
      </button>
      <p className="agrocloud-dashboard-editor__panel-lede">
        Customize <strong>{themeLabel}</strong>. Preview changes instantly on the dashboard canvas.
      </p>
      <div className="agrocloud-dashboard-editor__accordion agrocloud-dashboard-editor__theme-customize">
        <Section
          id="mode"
          title="Light &amp; dark modes"
          open={openSection === 'mode'}
          onToggle={() => toggle('mode')}
        >
          <label className="agrocloud-dashboard-editor__radio">
            <input
              type="radio"
              name="colorMode"
              checked={custom.colorMode === 'inherit'}
              onChange={() => update({ colorMode: 'inherit' })}
            />
            <span>Inherit from theme</span>
          </label>
          <label className="agrocloud-dashboard-editor__radio">
            <input
              type="radio"
              name="colorMode"
              checked={custom.colorMode === 'light'}
              onChange={() => update({ colorMode: 'light' })}
            />
            <span>Light mode</span>
          </label>
          <label className="agrocloud-dashboard-editor__radio">
            <input
              type="radio"
              name="colorMode"
              checked={custom.colorMode === 'dark'}
              onChange={() => update({ colorMode: 'dark' })}
            />
            <span>Dark mode</span>
          </label>
        </Section>

        <Section
          id="colors"
          title="Custom color schemes"
          open={openSection === 'colors'}
          onToggle={() => toggle('colors')}
        >
          <ColorField label="Primary" value={custom.primaryColor} onChange={v => update({ primaryColor: v })} />
          <ColorField label="Secondary" value={custom.secondaryColor} onChange={v => update({ secondaryColor: v })} />
          <ColorField label="Accent" value={custom.accentColor} onChange={v => update({ accentColor: v })} />
        </Section>

        <Section
          id="typography"
          title="Typography &amp; font styles"
          open={openSection === 'typography'}
          onToggle={() => toggle('typography')}
        >
          <label className="agrocloud-dashboard-editor__field-label">Font family</label>
          <select
            className="agrocloud-dashboard-editor__select"
            value={custom.fontFamily}
            onChange={e => update({ fontFamily: e.target.value })}
          >
            <option value="'Segoe UI', 'Avenir Next', system-ui, sans-serif">Segoe UI / Avenir</option>
            <option value="Georgia, 'Times New Roman', serif">Georgia</option>
            <option value="'Courier New', monospace">Courier New</option>
          </select>
          <label className="agrocloud-dashboard-editor__field-label">Font size scale ({custom.fontSizeScale}%)</label>
          <input
            type="range"
            min={80}
            max={130}
            step={5}
            value={custom.fontSizeScale}
            onChange={e => update({ fontSizeScale: Number(e.target.value) })}
            className="agrocloud-dashboard-editor__range"
          />
        </Section>

        <Section
          id="background"
          title="Dashboard backgrounds"
          open={openSection === 'background'}
          onToggle={() => toggle('background')}
        >
          <ColorField label="Background" value={custom.backgroundColor} onChange={v => update({ backgroundColor: v })} />
        </Section>

        <Section
          id="widgets"
          title="Widget appearance"
          open={openSection === 'widgets'}
          onToggle={() => toggle('widgets')}
        >
          <ColorField label="Widget background" value={custom.widgetBackground} onChange={v => update({ widgetBackground: v })} />
          <label className="agrocloud-dashboard-editor__field-label">Widget opacity ({custom.widgetOpacity}%)</label>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={custom.widgetOpacity}
            onChange={e => update({ widgetOpacity: Number(e.target.value) })}
            className="agrocloud-dashboard-editor__range"
          />
        </Section>

        <Section
          id="effects"
          title="Transparency, blur, borders &amp; shadows"
          open={openSection === 'effects'}
          onToggle={() => toggle('effects')}
        >
          <label className="agrocloud-dashboard-editor__radio">
            <input type="checkbox" checked={custom.blurEffects} onChange={e => update({ blurEffects: e.target.checked })} />
            <span>Enable blur effects</span>
          </label>
          <label className="agrocloud-dashboard-editor__radio">
            <input type="checkbox" checked={custom.showShadows} onChange={e => update({ showShadows: e.target.checked })} />
            <span>Show widget shadows</span>
          </label>
          <label className="agrocloud-dashboard-editor__field-label">Corner radius ({custom.borderRadius}px)</label>
          <input
            type="range"
            min={0}
            max={16}
            step={1}
            value={custom.borderRadius}
            onChange={e => update({ borderRadius: Number(e.target.value) })}
            className="agrocloud-dashboard-editor__range"
          />
        </Section>

        <Section
          id="header"
          title="Header &amp; toolbar styling"
          open={openSection === 'header'}
          onToggle={() => toggle('header')}
        >
          <label className="agrocloud-dashboard-editor__field-label">Header style</label>
          <select
            className="agrocloud-dashboard-editor__select"
            value={custom.headerStyle}
            onChange={e => update({ headerStyle: e.target.value as AgroCloudDashboardThemeCustom['headerStyle'] })}
          >
            <option value="default">Default</option>
            <option value="compact">Compact</option>
            <option value="branded">Branded</option>
          </select>
        </Section>

        <Section id="brand" title="Logo &amp; brand identity" open={openSection === 'brand'} onToggle={() => toggle('brand')}>
          <label className="agrocloud-dashboard-editor__field-label">Brand label</label>
          <input
            type="text"
            className="agrocloud-dashboard-editor__text-input"
            value={custom.logoText}
            onChange={e => update({ logoText: e.target.value })}
            placeholder="Elite AgroCloud"
          />
        </Section>
      </div>
      <div className="agrocloud-dashboard-editor__theme-customize-actions">
        <button type="button" className="agrocloud-dashboard-editor__theme-reset" onClick={reset}>
          Reset to theme defaults
        </button>
      </div>
    </>
  )
}

function Section({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: SectionId
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className={`agrocloud-dashboard-editor__accordion-section${open ? ' is-open' : ''}`}>
      <button type="button" className="agrocloud-dashboard-editor__accordion-head" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        <span className="agrocloud-dashboard-editor__accordion-icons">
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'}`} aria-hidden />
        </span>
      </button>
      {open ? <div className="agrocloud-dashboard-editor__accordion-body">{children}</div> : null}
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="agrocloud-dashboard-editor__color-field">
      <span className="agrocloud-dashboard-editor__field-label">{label}</span>
      <span className="agrocloud-dashboard-editor__color-input-wrap">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={`${label} color`} />
        <input
          type="text"
          className="agrocloud-dashboard-editor__text-input agrocloud-dashboard-editor__text-input--compact"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </span>
    </label>
  )
}
