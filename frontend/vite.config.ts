import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, gzip } from 'node:zlib'
import { defineConfig, type Plugin, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { appConfig } from './config/app'
import { API_PORT, VITE_PORT, WS_PORT } from '../scripts/devPorts.mjs'

/** Root `/` for custom domains; default `/AgroCloud/` for GitHub Pages. */
function resolveBuildBasePath(): string {
  const raw = String(process.env.VITE_BASE_PATH || process.env.AGRO_BASE_PATH || '').trim()
  if (raw === '/') return '/'
  if (raw.length > 0) return raw.endsWith('/') ? raw : `${raw}/`
  return appConfig.basePath
}

const buildBasePath = resolveBuildBasePath()

const gzipAsync = promisify(gzip)
const brotliAsync = promisify(brotliCompress)

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Production builds enable PWA unless explicitly disabled (desktop behavior unchanged). `npm run dev:pwa` sets ENABLE_PWA=true. */
const pwaDevMode = process.env.ENABLE_PWA === 'true'
const pwaEnabled =
  process.env.VITE_ENABLE_PWA !== 'false' && (pwaDevMode || process.env.NODE_ENV === 'production')

/** In-repo SIW entrypoints so CI / GitHub Pages builds always succeed. */
const SATELLITE_INTELLIGENCE_WORKSPACE_SHIM = resolve(__dirname, 'src/shims/satellite-intelligence-workspace')

/**
 * Optional absolute path to an external SIW `src` directory (local monorepo).
 * When unset or missing on disk, the shim above is used.
 */
const SATELLITE_INTELLIGENCE_WORKSPACE_SRC = (() => {
  const fromEnv = (process.env.SATELLITE_INTELLIGENCE_WORKSPACE || '').trim()
  if (fromEnv) {
    const abs = isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv)
    if (existsSync(abs)) return abs
  }
  return SATELLITE_INTELLIGENCE_WORKSPACE_SHIM
})()

/** SIW sources live outside Vite `root`; resolve bare imports from this frontend package's node_modules. */
function satelliteIntelligenceWorkspaceDependencyResolve(): Plugin {
  const require = createRequire(resolve(__dirname, 'package.json'))
  return {
    name: 'siw-external-node-resolve',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer?.includes('GIS RS Intelligence Workspace')) return null
      if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) return null
      try {
        return require.resolve(id, { paths: [__dirname] })
      } catch {
        return null
      }
    },
  }
}
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.mjs',
  '.svg',
  '.txt',
  '.wasm',
  '.xml',
])

function buildCompressionPlugin(): Plugin {
  let config: ResolvedConfig

  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
      entries.map((entry) => {
        const fullPath = join(dir, entry.name)
        return entry.isDirectory() ? walk(fullPath) : Promise.resolve([fullPath])
      }),
    )
    return files.flat()
  }

  return {
    name: 'agrocloud-compression',
    apply: 'build',
    configResolved(resolved) {
      config = resolved
    },
    async closeBundle() {
      const outDir = isAbsolute(config.build.outDir) ? config.build.outDir : join(config.root, config.build.outDir)
      if (!existsSync(outDir)) {
        config.logger.warn(`[agrocloud-compression] skip — outDir missing: ${outDir}`)
        return
      }
      const files = await walk(outDir)
      await Promise.all(
        files
          .filter((file) => COMPRESSIBLE_EXTENSIONS.has(extname(file)) && !file.endsWith('.gz') && !file.endsWith('.br'))
          .map(async (file) => {
            const content = await readFile(file)
            if (content.byteLength < 10240) return
            const [gzipped, brotlied] = await Promise.all([gzipAsync(content), brotliAsync(content)])
            await Promise.all([writeFile(`${file}.gz`, gzipped), writeFile(`${file}.br`, brotlied)])
          }),
      )
    },
  }
}

/** Vite serves `base` with a trailing slash; `/AgroCloud` (no slash) returns 404. Browsers/bookmarks often omit it. */
function agroCloudBaseTrailingSlashRedirect(): Plugin {
  const baseWithSlash = buildBasePath === '/' ? '/' : buildBasePath
  const noTrailingSlash = baseWithSlash.replace(/\/$/, '')
  const redirect: (req: IncomingMessage, res: ServerResponse, next: () => void) => void = (req, res, next) => {
    const raw = req.url ?? ''
    const pathOnly = raw.split('?')[0] ?? ''
    if (pathOnly !== noTrailingSlash) {
      next()
      return
    }
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''
    const location = query ? `${noTrailingSlash}/${query}` : baseWithSlash
    res.writeHead(302, { Location: location })
    res.end()
  }
  return {
    name: 'agrocloud-base-trailing-slash',
    configureServer(s) {
      s.middlewares.use(redirect)
    },
    configurePreviewServer(s) {
      s.middlewares.use(redirect)
    },
  }
}

/** Unique every `vite build` so GitHub Pages root `index.html` always changes and deploy commits are not skipped. */
function pagesBuildStamp(): Plugin {
  return {
    name: 'agri-pages-build-stamp',
    apply: 'build',
    transformIndexHtml(html) {
      const run = (process.env.GITHUB_RUN_ID || '').trim()
      const attempt = (process.env.GITHUB_RUN_ATTEMPT || '').trim()
      const sha = (process.env.GITHUB_SHA || '').trim()
      const stamp = [run, attempt, sha, `t${Date.now()}`].filter(Boolean).join('-')
      const meta = `<meta name="agro-pages-build" content="${stamp}" />`
      if (html.includes('name="agro-pages-build"')) {
        return html.replace(/<meta\s+name="agro-pages-build"\s+content="[^"]*"\s*\/?>/i, meta)
      }
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    ${meta}`)
    },
  }
}

/** Production HTML: canonical URL (custom domain or GitHub Pages). */
function productionCanonicalLink(): Plugin {
  const href =
    String(process.env.VITE_APP_CANONICAL_URL || process.env.APP_ORIGIN || appConfig.productionPublicUrl)
      .trim()
      .replace(/\/$/, '') + '/'
  return {
    name: 'agri-production-canonical',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes('rel="canonical"')) return html
      return html.replace('</head>', `    <link rel="canonical" href="${href}" />\n  </head>`)
    },
  }
}

/**
 * GitHub Pages: `/AgroCloud` (no trailing slash) and `/AgroCloud/` with empty hash break the HashRouter shell.
 * Normalize to `.../AgroCloud/#/` before the app bundle runs.
 */
function ghPagesHashAndSlashRedirect(): Plugin {
  const base = buildBasePath
  const withSlash = base.endsWith('/') ? base : `${base}/`
  const noSlash = withSlash.replace(/\/$/, '')
  const marker = 'data-agro-gh-pages-redirect'
  const snippet = `<script ${marker}="1">;(function(){try{var h=String(location.hostname||"");if(h.indexOf("github.io")===-1)return;var p=location.pathname||"";var ws=${JSON.stringify(withSlash)};var ns=${JSON.stringify(noSlash)};if(p===ns){location.replace(location.origin+ws+location.search+(location.hash&&location.hash.length>1?location.hash:"#/"));return;}if((p===ws||p===ns+"/")&&(!location.hash||location.hash==="#")){location.replace(location.origin+ws+location.search+"#/");}}catch(_){}})();</script>`
  return {
    name: 'agro-gh-pages-hash-redirect',
    apply: 'build',
    transformIndexHtml(html) {
      if (html.includes(marker)) return html
      return html.replace('<body>', `<body>\n    ${snippet}`)
    },
  }
}

export default defineConfig({
  base: buildBasePath,
  /** Load `VITE_*` from repo-root `.env` (shared with Node backend). */
  envDir: resolve(__dirname, '..'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@satellite-intelligence-workspace': SATELLITE_INTELLIGENCE_WORKSPACE_SRC,
      // Dev / non-PWA: vite-plugin-pwa is off — stub so `import('virtual:pwa-register')` still resolves.
      ...(!pwaEnabled
        ? { 'virtual:pwa-register': resolve(__dirname, 'src/shims/pwa-register-stub.ts') }
        : {}),
    },
  },
  define: {
    'import.meta.env.VITE_ENABLE_PWA': JSON.stringify(pwaEnabled ? 'true' : 'false'),
  },
  build: {
    chunkSizeWarningLimit: 1800,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('mapbox-gl')) return 'mapbox-gl'
          if (id.includes('maplibre-gl')) return 'maplibre-gl'
          if (id.includes('leaflet')) return 'leaflet'
          if (id.includes('@fortawesome')) return 'vendor-icons'
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'vendor-charts'
          if (id.includes('@turf')) return 'vendor-turf'
          if (id.includes('exceljs')) return 'vendor-excel'
          if (id.includes('/xlsx/') || id.includes('\\xlsx\\')) return 'vendor-xlsx'
          if (id.includes('jspdf')) return 'vendor-pdf'
          if (id.includes('geotiff')) return 'vendor-geotiff'
          if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react'
        },
      },
    },
  },
  plugins: [
    satelliteIntelligenceWorkspaceDependencyResolve(),
    agroCloudBaseTrailingSlashRedirect(),
    pagesBuildStamp(),
    ghPagesHashAndSlashRedirect(),
    productionCanonicalLink(),
    react(),
    ...(pwaEnabled
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: null,
            devOptions: { enabled: pwaDevMode },
            workbox: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest,json}'],
              globIgnores: [
                '**/*.{br,gz}',
                '**/mapbox-gl-*.js',
                '**/SatelliteIntelligence-*.js',
                '**/GisMap-*.js',
                '**/GeoExplorerGeminiMessageParts-*.js',
                '**/jspdf.plugin.autotable-*.js',
                '**/html2canvas*.js',
                '**/geotiff-*.js',
                '**/decoder-*.js',
              ],
              maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
              navigateFallback: 'index.html',
              navigateFallbackDenylist: [/^\/api/, /^\/ws/, /^\/analysis-api/],
              cleanupOutdatedCaches: true,
              clientsClaim: true,
              skipWaiting: true,
              runtimeCaching: [
                {
                  urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/i,
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'agro-open-meteo',
                    expiration: { maxEntries: 48, maxAgeSeconds: 60 * 60 * 3 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
                {
                  urlPattern: /^https:\/\/api\.mapbox\.com\/.*/i,
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'agro-mapbox-api',
                    expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
                {
                  urlPattern: /^https:\/\/.*\.tiles\.mapbox\.com\/.*/i,
                  handler: 'StaleWhileRevalidate',
                  options: {
                    cacheName: 'agro-mapbox-tiles',
                    expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 14 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
            includeAssets: [
              'agrocloud-logo.png',
              'agrocloud-logo-core.png',
              'agrocloud-mark-leaves.png',
              'elite-agro-logo-white.png',
              'agrocloud-app-icon.svg',
              'favicon.png',
              'favicon-16x16.png',
              'favicon-32x32.png',
              'apple-touch-icon.png',
              'apple-touch-icon-152.png',
              'apple-touch-icon-167.png',
              'pwa-192x192.png',
              'pwa-512x512.png',
            ],
            manifest: {
              id: buildBasePath,
              name: 'AgroCloud — Smart Agriculture & GIS',
              short_name: 'AgroCloud',
              description:
                'Elite AgroCloud: smart agriculture, satellite intelligence, GIS maps, and field operations.',
              start_url: buildBasePath,
              scope: buildBasePath,
              display: 'standalone',
              display_override: ['standalone', 'minimal-ui', 'browser'],
              orientation: 'any',
              background_color: '#ffffff',
              theme_color: '#047857',
              lang: 'en',
              dir: 'ltr',
              categories: ['business', 'productivity', 'utilities'],
              prefer_related_applications: false,
              icons: [
                {
                  src: 'agrocloud-app-icon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any',
                },
                {
                  src: 'pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: 'pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: 'apple-touch-icon.png',
                  sizes: '180x180',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: 'apple-touch-icon-152.png',
                  sizes: '152x152',
                  type: 'image/png',
                  purpose: 'any',
                },
                {
                  src: 'apple-touch-icon-167.png',
                  sizes: '167x167',
                  type: 'image/png',
                  purpose: 'any',
                },
              ],
              shortcuts: [
                {
                  name: 'Home',
                  short_name: 'Home',
                  url: `${buildBasePath === '/' ? '/' : buildBasePath}#/`,
                  icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
                },
                {
                  name: 'Satellite Intelligence',
                  short_name: 'Satellite',
                  url: `${buildBasePath === '/' ? '/' : buildBasePath}#/satellite/indices`,
                  icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
                },
                {
                  name: 'GIS Map',
                  short_name: 'GIS',
                  url: `${buildBasePath === '/' ? '/' : buildBasePath}#/satellite/gis`,
                  icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
                },
              ],
            },
          }),
        ]
      : []),
    buildCompressionPlugin()
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**']
  },
  server: {
    port: VITE_PORT,
    host: '0.0.0.0',
    strictPort: true,
    /** Allow opening dev server by LAN IP (tablet/phone on same Wi‑Fi). */
    allowedHosts: true,
    ...(SATELLITE_INTELLIGENCE_WORKSPACE_SRC !== SATELLITE_INTELLIGENCE_WORKSPACE_SHIM
      ? { fs: { allow: [SATELLITE_INTELLIGENCE_WORKSPACE_SRC] } }
      : {}),
    headers: {
      'Cache-Control': 'no-store',
    },
    hmr: {
      clientPort: VITE_PORT,
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://127.0.0.1:${WS_PORT}`,
        ws: true,
      },
      /** Analysis engine on host — reachable from other devices via same origin. */
      '/analysis-api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/analysis-api/, ''),
      },
    },
  },
  preview: {
    port: VITE_PORT,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://127.0.0.1:${WS_PORT}`,
        ws: true,
      },
      '/analysis-api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/analysis-api/, ''),
      },
    },
  },
})
