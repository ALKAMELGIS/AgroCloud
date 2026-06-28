/**
 * Fails CI / local Pages prep if frontend/dist embeds likely API secrets.
 * Vite inlines VITE_* at build time — never ship dist with real keys in git.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
const distDir = path.join(root, 'frontend', 'dist')

/** @type {{ id: string; pattern: RegExp; hint: string }[]} */
const RULES = [
  {
    id: 'openweather-appid',
    pattern: /appid=[a-f0-9]{32}/i,
    hint: 'OpenWeatherMap key in URL (appid=…)',
  },
  {
    id: 'google-api-key',
    pattern: /AIza[0-9A-Za-z\-_]{35}/,
    hint: 'Google API key (AIza…)',
  },
  {
    id: 'openai-sk',
    pattern: /sk-[a-zA-Z0-9]{20,}/,
    hint: 'OpenAI-style secret key (sk-…)',
  },
  {
    id: 'github-pat',
    pattern: /ghp_[a-zA-Z0-9]{36,}/,
    hint: 'GitHub personal access token (ghp_…)',
  },
  {
    id: 'aws-access-key',
    pattern: /AKIA[0-9A-Z]{16}/,
    hint: 'AWS access key id (AKIA…)',
  },
  {
    id: 'mapbox-token',
    pattern: /pk\.eyJ[a-zA-Z0-9_-]{80,}/,
    hint: 'Mapbox access token (pk.eyJ…)',
  },
  {
    id: 'jwt-like',
    pattern: /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
    hint: 'JWT-shaped bearer token',
  },
]

function loadBlocklist() {
  const file = path.join(root, 'scripts', 'secret-scan-blocklist.txt')
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

/**
 * Full token strings that are intentionally public (e.g. a URL-restricted Mapbox `pk.` token
 * embedded for a static GitHub Pages deploy). Supplied via env so the value is never committed.
 * A rule match is ignored when it is a substring of an allowed token.
 */
function loadAllowlist() {
  return String(process.env.PAGES_SECRET_SCAN_ALLOW || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 16)
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkFiles(p, out)
    else if (/\.(js|css|html|json|webmanifest|txt|map)$/i.test(ent.name)) out.push(p)
  }
  return out
}

/**
 * @param {string} [distPath]
 * @returns {{ ok: boolean; errors: string[] }}
 */
export function scanDistForSecrets(distPath = distDir) {
  const errors = []
  const blocklist = loadBlocklist()
  const allowlist = loadAllowlist()
  const isAllowed = (matched) =>
    allowlist.some((token) => token.includes(matched) || matched.includes(token))

  if (!fs.existsSync(distPath)) {
    return { ok: false, errors: [`dist not found: ${distPath}`] }
  }

  const files = walkFiles(distPath)
  for (const file of files) {
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    const rel = path.relative(root, file).replace(/\\/g, '/')

    for (const needle of blocklist) {
      if (needle.length >= 8 && text.includes(needle)) {
        errors.push(`${rel}: blocklisted secret fragment (${needle.slice(0, 4)}…)`)
      }
    }

    for (const rule of RULES) {
      const re = new RegExp(
        rule.pattern.source,
        rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g',
      )
      let match
      while ((match = re.exec(text))) {
        if (isAllowed(match[0])) continue
        errors.push(`${rel}: ${rule.hint} [${rule.id}]`)
        break
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

function main() {
  const { ok, errors } = scanDistForSecrets()
  if (ok) {
    console.log('pages-dist-secrets-check: OK (no embedded secrets detected).')
    return
  }
  console.error('pages-dist-secrets-check: FAILED — build must not embed API keys:\n- ' + errors.join('\n- '))
  console.error(
    '\nRebuild with empty VITE_* vars (see .github/workflows/deploy-pages.yml). Never commit root /assets from a machine with .env filled in.',
  )
  process.exit(1)
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main()
}
