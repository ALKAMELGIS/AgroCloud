/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Optional Vite env keys used by this app (documented in repo root `.env.example`). */
interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_OPENAI_API_KEY?: string
  readonly VITE_DEEPSEEK_API_KEY?: string
  readonly VITE_CLAUDE_API_KEY?: string
  readonly VITE_OLLAMA_BASE_URL?: string
  readonly VITE_OLLAMA_MODEL?: string
  readonly VITE_OPENWEATHER_API_KEY?: string
  readonly VITE_OPENROUTESERVICE?: string
  readonly VITE_SENTINEL_HUB_ACCESS_TOKEN?: string
  readonly VITE_SENTINEL_HUB_WMS_INSTANCE_ID?: string
  /** Copernicus Data Space (CDSE) Sentinel Hub Configuration Utility instance id. */
  readonly VITE_CDSE_WMS_INSTANCE_ID?: string
  readonly VITE_GOOGLE_MAPS_SERVER_API_KEY?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_ARCGIS_PORTAL_TOKEN?: string
  readonly VITE_MAPBOX_TOKEN?: string
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string
  /** Absolute URL for GET/PUT api-secrets when the UI is not served from the Node host (e.g. GitHub Pages). */
  readonly VITE_AGRI_API_SECRETS_URL?: string
  readonly VITE_AGRI_API_SECRETS_TOKEN?: string
  /** Optional GET/PUT base for cross-device profile sync (default `/api/v1/account/profile-extra`). */
  readonly VITE_AGRI_USER_PROFILE_URL?: string
  readonly VITE_AGRI_USER_PROFILE_TOKEN?: string
  /** Base URL for GeoDash FastAPI (e.g. http://localhost:8090) — no trailing slash */
  readonly VITE_GEODASH_API_URL?: string
  /** Set at build time when PWA + service worker are enabled (production). */
  readonly VITE_ENABLE_PWA?: string
  /** Optional POST endpoint for client error reports (production monitoring). */
  readonly VITE_CLIENT_ERROR_REPORT_URL?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'calcite-action-group': import('react').DetailedHTMLProps<import('react').HTMLAttributes<HTMLElement>, HTMLElement> & {
        layout?: string
        'overlay-positioning'?: string
        scale?: string
        'selection-mode'?: string
        'calcite-hydrated'?: string
      }
    }
  }
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.docx?url' {
  const src: string
  export default src
}

declare module 'leaflet/dist/images/marker-icon-2x.png' {
  const src: string
  export default src
}

declare module 'leaflet/dist/images/marker-icon.png' {
  const src: string
  export default src
}

declare module 'leaflet/dist/images/marker-shadow.png' {
  const src: string
  export default src
}

export {}
