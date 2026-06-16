/**
 * Legacy: force branch publishing (main / root). Prefer `ensure-pages-workflow.mjs` +
 * `.github/workflows/deploy-pages.yml` (artifact deploy) so each push serves the fresh build.
 *
 * Forces GitHub Pages to use legacy branch publishing from main / (root).
 * If the repo was left on build_type "workflow", GitHub serves an Actions artifact
 * (often empty) and ignores index.html on main → 404 at project Pages URL.
 *
 * Env: GITHUB_REPOSITORY, GITHUB_TOKEN; optional PAGES_ADMIN_TOKEN.
 */
import process from 'node:process'

const repo = process.env.GITHUB_REPOSITORY
const tokA = process.env.GITHUB_TOKEN
const tokB = process.env.PAGES_ADMIN_TOKEN

if (!repo || !tokA) {
  console.error('ensure-pages-legacy-main: missing GITHUB_REPOSITORY or GITHUB_TOKEN')
  process.exit(1)
}

const [owner, name] = repo.split('/')
if (!owner || !name) {
  console.error('ensure-pages-legacy-main: bad GITHUB_REPOSITORY', repo)
  process.exit(1)
}

const api = `https://api.github.com/repos/${owner}/${name}/pages`
const ver = '2022-11-28'

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': ver,
    'Content-Type': 'application/json',
  }
}

async function getJson(token) {
  const res = await fetch(api, { headers: headers(token) })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { res, json, text }
}

async function putLegacy(token, label) {
  const body = JSON.stringify({
    build_type: 'legacy',
    source: { branch: 'main', path: '/' },
  })
  const res = await fetch(api, { method: 'PUT', headers: headers(token), body })
  const text = await res.text()
  if (res.ok || res.status === 204) {
    console.log(`ensure-pages-legacy-main: set legacy main / (root) via PUT (${label})`)
    return true
  }
  console.error(`ensure-pages-legacy-main: PUT failed (${label})`, res.status, text?.slice(0, 600))
  return false
}

async function postLegacy(token, label) {
  const body = JSON.stringify({
    build_type: 'legacy',
    source: { branch: 'main', path: '/' },
  })
  const res = await fetch(api, { method: 'POST', headers: headers(token), body })
  const text = await res.text()
  if (res.ok || res.status === 201) {
    console.log(`ensure-pages-legacy-main: created legacy main / (${label})`)
    return true
  }
  console.error(`ensure-pages-legacy-main: POST failed (${label})`, res.status, text?.slice(0, 600))
  return false
}

async function tryToken(token, label) {
  const { res, json } = await getJson(token)
  if (res.status === 200) {
    const bt = json?.build_type
    const br = json?.source?.branch
    const path = json?.source?.path
    if (bt === 'legacy' && br === 'main' && (path === '/' || path === '')) {
      console.log(`ensure-pages-legacy-main: already legacy + main / (${label})`)
      return true
    }
    if (bt === 'workflow') {
      console.log(`ensure-pages-legacy-main: switching from workflow → legacy (${label})`)
      return putLegacy(token, label)
    }
    if (bt === 'legacy' && (br !== 'main' || (path !== '/' && path !== ''))) {
      console.log(`ensure-pages-legacy-main: correcting branch/folder (${label})`)
      return putLegacy(token, label)
    }
    return putLegacy(token, label)
  }
  if (res.status === 404) {
    return postLegacy(token, label)
  }
  console.error('ensure-pages-legacy-main: GET /pages', res.status)
  return false
}

async function main() {
  if (await tryToken(tokA, 'GITHUB_TOKEN')) return
  if (tokB && tokB !== tokA) {
    console.error('ensure-pages-legacy-main: retry with PAGES_ADMIN_TOKEN')
    if (await tryToken(tokB, 'PAGES_ADMIN_TOKEN')) return
  }
  console.error(
    [
      'ensure-pages-legacy-main: could not force legacy branch Pages.',
      'Open: https://github.com/' + repo + '/settings/pages',
      'Set Source: Deploy from a branch → main → /(root).',
      'If Source shows GitHub Actions, switch away from it.',
      'Optional: add repo secret PAGES_ADMIN_TOKEN (repo scope or Administration+Contents on this repo).',
    ].join('\n'),
  )
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
