/**
 * Forces GitHub Pages to "Deploy from a branch" → main → PAGES_SOURCE_PATH (default /docs).
 *
 * Why branch publishing: when the repo was left on build_type "workflow", GitHub served an Actions
 * artifact (often empty) and ignored the committed build → 404. The deploy workflow commits the
 * SPA build to main:/docs (GitHub only allows "/" or "/docs" for branch publishing) and then runs
 * this script, so Pages is only pointed at /docs once that folder exists.
 *
 * Env: GITHUB_REPOSITORY, GITHUB_TOKEN; optional PAGES_ADMIN_TOKEN, PAGES_SOURCE_PATH ("/docs" | "/").
 */
import process from 'node:process'

const TAG = 'ensure-pages-branch-source'

const repo = process.env.GITHUB_REPOSITORY
const tokA = process.env.GITHUB_TOKEN
const tokB = process.env.PAGES_ADMIN_TOKEN

if (!repo || !tokA) {
  console.error(`${TAG}: missing GITHUB_REPOSITORY or GITHUB_TOKEN`)
  process.exit(1)
}

const [owner, name] = repo.split('/')
if (!owner || !name) {
  console.error(`${TAG}: bad GITHUB_REPOSITORY`, repo)
  process.exit(1)
}

const api = `https://api.github.com/repos/${owner}/${name}/pages`
const ver = '2022-11-28'
const SOURCE_PATH = process.env.PAGES_SOURCE_PATH === '/' ? '/' : '/docs'

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
    source: { branch: 'main', path: SOURCE_PATH },
  })
  const res = await fetch(api, { method: 'PUT', headers: headers(token), body })
  const text = await res.text()
  if (res.ok || res.status === 204) {
    console.log(`${TAG}: set legacy main ${SOURCE_PATH} via PUT (${label})`)
    return true
  }
  console.error(`${TAG}: PUT failed (${label})`, res.status, text?.slice(0, 600))
  return false
}

async function postLegacy(token, label) {
  const body = JSON.stringify({
    build_type: 'legacy',
    source: { branch: 'main', path: SOURCE_PATH },
  })
  const res = await fetch(api, { method: 'POST', headers: headers(token), body })
  const text = await res.text()
  if (res.ok || res.status === 201) {
    console.log(`${TAG}: created legacy main ${SOURCE_PATH} (${label})`)
    return true
  }
  console.error(`${TAG}: POST failed (${label})`, res.status, text?.slice(0, 600))
  return false
}

async function tryToken(token, label) {
  const { res, json } = await getJson(token)
  if (res.status === 200) {
    const bt = json?.build_type
    const br = json?.source?.branch
    const path = json?.source?.path
    const samePath = SOURCE_PATH === '/' ? path === '/' || path === '' : path === SOURCE_PATH
    if (bt === 'legacy' && br === 'main' && samePath) {
      console.log(`${TAG}: already legacy + main ${SOURCE_PATH} (${label})`)
      return true
    }
    if (bt === 'workflow') {
      console.log(`${TAG}: switching from workflow → legacy (${label})`)
      return putLegacy(token, label)
    }
    if (bt === 'legacy' && (br !== 'main' || !samePath)) {
      console.log(`${TAG}: correcting branch/folder (${label})`)
      return putLegacy(token, label)
    }
    return putLegacy(token, label)
  }
  if (res.status === 404) {
    return postLegacy(token, label)
  }
  console.error(`${TAG}: GET /pages`, res.status)
  return false
}

async function main() {
  if (await tryToken(tokA, 'GITHUB_TOKEN')) return
  if (tokB && tokB !== tokA) {
    console.error(`${TAG}: retry with PAGES_ADMIN_TOKEN`)
    if (await tryToken(tokB, 'PAGES_ADMIN_TOKEN')) return
  }
  console.error(
    [
      `${TAG}: could not force legacy branch Pages.`,
      'Open: https://github.com/' + repo + '/settings/pages',
      `Set Source: Deploy from a branch → main → ${SOURCE_PATH}.`,
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
