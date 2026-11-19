import { ELITE_AGRO_LOGO_WHITE_URL } from '@/core/config/brandAssets'
import { fetchPriorityAttr } from '@/core/utils/fetchPriority'

/**
 * The brand side of the sign-in page: deep field-green panel with a serif headline, three
 * capability points and an emblem (arcs framing a sprout over crop rows). Pure SVG/CSS — no
 * photos, video or third-party artwork.
 */

const COPY = {
  en: {
    eyebrow: 'Precision agriculture platform',
    titleStrong: 'Grow every field',
    titleLight: 'with clear insight',
    lead: 'Maps, satellite crop health, irrigation and daily field records — one place for the whole farm team.',
    points: ['Live GIS maps of every farm and block', 'Satellite crop-health monitoring', 'Field operations, records and reports'],
    footer: 'Elite Agro Projects',
  },
  ar: {
    eyebrow: 'منصة الزراعة الدقيقة',
    titleStrong: 'ازرع كل حقل',
    titleLight: 'برؤية واضحة',
    lead: 'الخرائط وصحة المحاصيل بالأقمار الصناعية والري وسجلات الحقل اليومية — مكان واحد لفريق المزرعة كله.',
    points: ['خرائط GIS مباشرة لكل مزرعة وقطاع', 'مراقبة صحة المحاصيل بالأقمار الصناعية', 'العمليات الميدانية والسجلات والتقارير'],
    footer: 'Elite Agro Projects',
  },
} as const

/** Line-art leaves tiled at low opacity behind the panel. */
function LeafTexture() {
  return (
    <svg className="login-showcase__texture" aria-hidden="true" focusable="false">
      <defs>
        <pattern id="login-leaf-pattern" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
          <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
            <path d="M20 70 C 20 40, 50 22, 70 20 C 68 44, 50 66, 20 70 Z" />
            <path d="M20 70 L 58 32" />
            <path d="M80 112 C 82 92, 100 80, 114 80 C 112 98, 98 110, 80 112 Z" />
            <path d="M80 112 L 106 88" />
            <path d="M96 30 v 26 M96 40 c -6 -2 -10 -6 -10 -12 M96 46 c 6 -2 10 -6 10 -12" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#login-leaf-pattern)" />
    </svg>
  )
}

/** Emblem: sun-yellow and field-green arcs around a disc with crop rows and a sprout. */
function Emblem() {
  return (
    <svg className="login-showcase__emblem" viewBox="0 0 320 320" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="login-emblem-sky" cx="50%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#3f8a5f" />
          <stop offset="100%" stopColor="#163b2e" />
        </radialGradient>
        <linearGradient id="login-emblem-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f6b3f" />
          <stop offset="100%" stopColor="#1a4a31" />
        </linearGradient>
        <clipPath id="login-emblem-disc">
          <circle cx="160" cy="160" r="112" />
        </clipPath>
      </defs>

      {/* outer arcs */}
      <circle cx="160" cy="160" r="148" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" strokeDasharray="2 7" strokeLinecap="round" />
      <path d="M160 26 A 134 134 0 0 1 294 160" fill="none" stroke="#2ab939" strokeWidth="14" strokeLinecap="round" />
      <path d="M58 247 A 134 134 0 0 0 262 247" fill="none" stroke="#fdd61f" strokeWidth="14" strokeLinecap="round" />
      <circle cx="160" cy="160" r="122" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />

      {/* disc: sky, sun, crop rows, sprout */}
      <g clipPath="url(#login-emblem-disc)">
        <rect x="40" y="40" width="240" height="240" fill="url(#login-emblem-sky)" />
        <circle cx="214" cy="112" r="22" fill="#fdd61f" opacity="0.95" />
        <circle cx="214" cy="112" r="34" fill="#fdd61f" opacity="0.18" />
        <path d="M40 196 Q 160 150 280 196 V 290 H 40 Z" fill="url(#login-emblem-soil)" />
        <g fill="none" stroke="#7fd36b" strokeWidth="3" strokeLinecap="round" opacity="0.75">
          <path d="M160 178 L 70 290" />
          <path d="M160 178 L 112 290" />
          <path d="M160 178 L 160 290" />
          <path d="M160 178 L 208 290" />
          <path d="M160 178 L 250 290" />
        </g>
        <path d="M40 196 Q 160 150 280 196" fill="none" stroke="#9be08a" strokeWidth="2" opacity="0.6" />
      </g>
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M160 214 C 160 190, 160 172, 160 146" fill="none" stroke="#e9f7e3" strokeWidth="5" />
        <path d="M160 168 C 140 168, 118 156, 112 132 C 136 130, 156 144, 160 168 Z" fill="#2ab939" stroke="#e9f7e3" strokeWidth="3" />
        <path d="M160 150 C 178 150, 202 138, 210 112 C 184 110, 164 126, 160 150 Z" fill="#43c95a" stroke="#e9f7e3" strokeWidth="3" />
        <path d="M118 135 L 158 166 M 204 116 L 162 148" stroke="#e9f7e3" strokeWidth="2" opacity="0.8" />
      </g>
    </svg>
  )
}

export function LoginShowcase({ language }: { language: string }) {
  const t = language === 'ar' ? COPY.ar : COPY.en
  return (
    <section className="login-showcase" aria-label={t.eyebrow}>
      <LeafTexture />
      <div className="login-showcase__inner">
        <img className="login-showcase__logo" src={ELITE_AGRO_LOGO_WHITE_URL} alt="Elite Agro Projects" width={351} height={101} {...fetchPriorityAttr('high')} />
        <div className="login-showcase__body">
          <div className="login-showcase__copy">
            <p className="login-showcase__eyebrow">{t.eyebrow}</p>
            <h2 className="login-showcase__title">
              <span className="login-showcase__title-strong">{t.titleStrong}</span>
              <span className="login-showcase__title-light">{t.titleLight}</span>
            </h2>
            <p className="login-showcase__lead">{t.lead}</p>
            <ul className="login-showcase__points">
              {t.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
          <Emblem />
        </div>
        <p className="login-showcase__footer">© {new Date().getFullYear()} {t.footer}</p>
      </div>
    </section>
  )
}
