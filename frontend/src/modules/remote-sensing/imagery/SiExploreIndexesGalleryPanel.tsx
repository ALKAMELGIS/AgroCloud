import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useSystemSettings } from '@/core/state/SystemSettingsContext'
import type { ThemeMode } from '@/core/types/systemSettings'
import type { RemoteSensingLayerSelectGroup } from '../indices/agroCompositeIndices'
import './siExploreIndexesGalleryPanel.css'

function resolveThemeIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light' || mode === 'custom') return false
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return false
}

export type SiExploreIndexesGalleryPanelProps = {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  groups: RemoteSensingLayerSelectGroup[]
  value: string
  onChange: (layerId: string) => void
  loading?: boolean
}

type GalleryTab = { id: string; label: string; title: string }

const GALLERY_TAB_LABEL_BY_ID: Record<string, string> = {
  core: 'Agriculture',
  'live-analysis-lulc': 'Land cover',
  'live-analysis-anomaly': 'Anomaly',
  'live-analysis-cultivation': 'Cultivation change',
  'live-analysis-mangrove': 'Mangrove',
  'derived-alert': 'Derived alerts',
  'sentinel-presets': 'Sentinel Hub',
  'vegetation-health': 'Veg Health',
  'water-moisture': 'Water & moisture',
  'irrigation-field': 'Irrigation & field',
  'growth-stability': 'Growth & stability',
  'risk-composite': 'Risk & composite',
  'crop-phenology': 'Crop phenology',
  'soil-salinity': 'Soil & salinity',
  'gold-exploration': 'Gold exploration',
  crop: 'Crop',
  mangrove: 'Mangrove composites',
}

function stripGalleryEmoji(text: string): string {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function tabLabelFromGroup(group: RemoteSensingLayerSelectGroup): string {
  const preset = GALLERY_TAB_LABEL_BY_ID[group.id]
  if (preset) return preset

  let label = stripGalleryEmoji(group.label || group.id)
  const liveTail = label.match(/^Live Analysis\s*·\s*(.+)$/i)
  if (liveTail?.[1]) label = liveTail[1].trim()

  label = label.replace(/\s+Layer$/i, '').replace(/\s*\(Delta\)\s*$/i, ' (Δ)')

  if (/^core interpretation$/i.test(label)) return 'Core interpretation'
  return label || group.id
}

function buildGalleryTabs(groups: RemoteSensingLayerSelectGroup[]): GalleryTab[] {
  const safe = Array.isArray(groups) ? groups : []
  const out: GalleryTab[] = [{ id: 'all', label: 'All layers', title: 'All layers' }]
  const used = new Map<string, number>()

  for (const g of safe) {
    if (!g?.options?.length) continue
    const title = tabLabelFromGroup(g)
    const key = title.toLowerCase()
    const count = (used.get(key) ?? 0) + 1
    used.set(key, count)
    const label = count > 1 ? `${title} (${count})` : title
    out.push({ id: g.id, label, title })
  }
  return out
}

const CAROUSEL_SCROLL_STEP = 168

export function SiExploreIndexesGalleryPanel({
  open,
  onClose,
  containerRef,
  groups,
  value,
  onChange,
  loading = false,
}: SiExploreIndexesGalleryPanelProps) {
  const { settings: systemSettings } = useSystemSettings()
  const themeIsDark = useMemo(
    () => resolveThemeIsDark(systemSettings.themeMode),
    [systemSettings.themeMode],
  )
  const tabs = useMemo(() => buildGalleryTabs(groups), [groups])

  const [activeTab, setActiveTab] = useState('all')
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null)
  const [canScrollBack, setCanScrollBack] = useState(false)
  const [canScrollFwd, setCanScrollFwd] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setMountEl(null)
      return
    }
    setMountEl(containerRef.current)
  }, [open, containerRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) setActiveTab('all')
  }, [open])

  const options = useMemo(() => {
    const safe = Array.isArray(groups) ? groups : []
    if (activeTab === 'all') {
      const seen = new Set<string>()
      const flat: RemoteSensingLayerSelectGroup['options'] = []
      for (const g of safe) {
        for (const opt of g.options ?? []) {
          const u = opt.id.toUpperCase()
          if (seen.has(u)) continue
          seen.add(u)
          flat.push(opt)
        }
      }
      return flat
    }
    const group = safe.find(g => g.id === activeTab)
    return group?.options ?? []
  }, [groups, activeTab])

  const syncScrollArrows = useCallback(() => {
    const el = scrollerRef.current
    if (!el) {
      setCanScrollBack(false)
      setCanScrollFwd(false)
      return
    }
    const max = el.scrollWidth - el.clientWidth
    setCanScrollBack(el.scrollLeft > 4)
    setCanScrollFwd(max > 4 && el.scrollLeft < max - 4)
  }, [])

  useEffect(() => {
    if (!open) return
    const el = scrollerRef.current
    if (!el) return
    syncScrollArrows()
    const onScroll = () => syncScrollArrows()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncScrollArrows()) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [open, options.length, activeTab, syncScrollArrows])

  useEffect(() => {
    if (!open || !value) return
    const el = scrollerRef.current
    if (!el) return
    const card = el.querySelector<HTMLElement>(`[data-layer-id="${CSS.escape(value.trim().toUpperCase())}"]`)
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [open, value, options.length, activeTab])

  const scrollCarousel = (dir: -1 | 1) => {
    scrollerRef.current?.scrollBy({ left: dir * CAROUSEL_SCROLL_STEP, behavior: 'smooth' })
  }

  if (!open || !mountEl) return null

  const selectedUpper = value.trim().toUpperCase()

  return createPortal(
    <section
      className={`si-explore-indexes-panel si-explore-indexes-panel--${themeIsDark ? 'dark' : 'light'}`}
      dir="ltr"
      aria-label="Explore Indexes"
      data-open={open ? 'true' : 'false'}
      onPointerDown={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <button
        type="button"
        className="si-explore-indexes-panel__grab"
        aria-label="Close Explore Indexes"
        onClick={onClose}
      >
        <span className="si-explore-indexes-panel__grab-bar" aria-hidden />
      </button>

      <header className="si-explore-indexes-panel__head">
        <h2 className="si-explore-indexes-panel__title">
          <i className="fa-solid fa-images" aria-hidden />
          Explore Indexes
        </h2>
        <button
          type="button"
          className="si-explore-indexes-panel__close"
          aria-label="Close Explore Indexes"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-explore-indexes-panel__tabs" role="tablist" aria-label="Index categories">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`si-explore-indexes-panel__tab${activeTab === tab.id ? ' is-active' : ''}`}
            title={tab.title}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="si-explore-indexes-panel__carousel-wrap">
        <button
          type="button"
          className="si-explore-indexes-panel__nav si-explore-indexes-panel__nav--prev"
          aria-label="Previous indexes"
          disabled={!canScrollBack}
          onClick={() => scrollCarousel(-1)}
        >
          <i className="fa-solid fa-chevron-left" aria-hidden />
        </button>

        <div className="si-explore-indexes-panel__carousel-host">
          {loading ? (
            <p className="si-explore-indexes-panel__empty" role="status">Loading layers…</p>
          ) : options.length ? (
            <div
              ref={scrollerRef}
              className="si-explore-indexes-panel__carousel"
              role="listbox"
              aria-label="Index layers"
            >
              {options.map(opt => {
                const active = opt.id.toUpperCase() === selectedUpper
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-layer-id={opt.id.toUpperCase()}
                    className={`si-explore-indexes-panel__card${active ? ' is-active' : ''}`}
                    title={opt.label}
                    onClick={() => onChange(opt.id)}
                  >
                    <span className="si-explore-indexes-panel__card-abbr">{opt.label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="si-explore-indexes-panel__empty" role="status">No layers in this category.</p>
          )}
        </div>

        <button
          type="button"
          className="si-explore-indexes-panel__nav si-explore-indexes-panel__nav--next"
          aria-label="Next indexes"
          disabled={!canScrollFwd}
          onClick={() => scrollCarousel(1)}
        >
          <i className="fa-solid fa-chevron-right" aria-hidden />
        </button>
      </div>
    </section>,
    mountEl,
  )
}
