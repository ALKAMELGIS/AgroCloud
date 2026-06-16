import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../lib/i18n'
import './AiAgroCloud.css'

/** Match Home → Satellite Imagery hub accent (violet tile header). */
const HUB_ACCENT = '#8B5CF6'

export default function AiAgroCloud() {
  const { language } = useLanguage()
  const ar = language === 'ar'
  const navigate = useNavigate()
  const [hubOpen, setHubOpen] = useState(true)

  const tiles = [
    {
      to: '/dashboards/ai-agro-chat',
      icon: 'fa-solid fa-comments',
      title: ar ? 'محادثة Agro الذكية' : 'AI Agro-Chat',
      desc: ar
        ? 'اسأل عن الحقول والطبقات والجداول بناءً على محتوى GIS.'
        : 'Ask about fields, layers, and tables using your GIS Content data.',
    },
  ] as const

  return (
    <div className="page home-page aac-home-like">
      <div className="home-sublist-view fade-in aac-home-like__sublist">
        <div className="home-header">
          <div className="home-header-row">
            <button
              type="button"
              className="back-btn"
              onClick={() => navigate(-1)}
              aria-label={ar ? 'رجوع' : 'Back'}
            >
              <i className="fa-solid fa-chevron-left" aria-hidden />
            </button>
            <div className="header-title">
              <span
                className="header-icon"
                style={
                  {
                    '--header-accent': HUB_ACCENT,
                    '--header-accent-rgb': '139 92 246',
                  } as CSSProperties
                }
              >
                <i className="fa-solid fa-cloud-bolt" aria-hidden />
              </span>
              <h2 id="aac-hub-title">{ar ? 'سحابة Agro الذكية' : 'AI AgroCloud'}</h2>
            </div>
            <button
              type="button"
              className="sublist-toggle"
              aria-expanded={hubOpen}
              aria-controls="aac-hub-tiles"
              onClick={() => setHubOpen(v => !v)}
            >
              <i className={`fa-solid ${hubOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden />
            </button>
          </div>
          <div
            id="aac-hub-tiles"
            className={hubOpen ? 'sublist-page-area' : 'sublist-page-area sublist-page-area--closed'}
            role="region"
            aria-label={ar ? 'روابط سحابة Agro' : 'AI AgroCloud links'}
            hidden={!hubOpen}
          >
            <div className="home-modern">
              <div className="home-apps-strip">
                <div className="home-apps-list">
                  {tiles.map(tile => (
                    <Link
                      key={tile.to}
                      className="app-icon-card"
                      to={tile.to}
                      aria-label={tile.title}
                      style={
                        {
                          '--app-accent': HUB_ACCENT,
                          '--app-accent-rgb': '139 92 246',
                        } as CSSProperties
                      }
                    >
                      <i className={`app-icon ${tile.icon} fa-fw`} aria-hidden />
                      <span className="app-label">{tile.title}</span>
                      <span className="app-meta">{ar ? 'فتح' : 'Open'}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
