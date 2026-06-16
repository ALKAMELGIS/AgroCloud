/**
 * Switches GitHub Pages to Actions-based deployment (artifact from deploy-pages).
 * Legacy "branch + root" publishing served stale or out-of-sync files until a second
 * bot commit landed; workflow publishing serves the exact dist from each run.
 *
 * Env: GITHUB_REPOSITORY, GITHUB_TOKEN; optional PAGES_ADMIN_TOKEN.
 *
 * Note: default GITHUB_TOKEN in Actions often cannot PUT /repos/.../pages (403).
 * Use repo secret PAGES_ADMIN_TOKEN (classic PAT: repo scope) or enable
 * Settings → Pages → GitHub Actions once manually, then use deploy-pages workflow.
 */
import process from 'node:process'

const repo = process.env.GITHUB_REPOSITORY
const tokA = process.env.GITHUB_TOKEN
const tokB = process.env.PAGES_ADMIN_TOKEN

if (!repo || !tokA) {
  console.error('ensure-pages-workflow: missing GITHUB_REPOSITORY or GITHUB_TOKEN')
  process.exit(1)
}

const [owner, name] = repo.split('/')
if (!owner || !name) {
  console.error('ensure-pages-workflow: bad GITHUB_REPOSITORY', repo)
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

async function putWorkflow(token, label) {
  const body = JSON.stringify({ build_type: 'workflow' })
  const res = await fetch(api, { method: 'PUT', headers: headers(token), body })
  const text = await res.text()
  if (res.ok || res.status === 204) {
    console.log(`ensure-pages-workflow: set build_type=workflow via PUT (${label})`)
    return true
  }
  console.error(`ensure-pages-workflow: PUT failed (${label})`, res.status, text?.slice(0, 800))
  return false
}

async function postWorkflow(token, label) {
  const body = JSON.stringify({ build_type: 'workflow' })
  const res = await fetch(api, { method: 'POST', headers: headers(token), body })
  const text = await res.text()
  if (res.ok || res.status === 201) {
    console.log(`ensure-pages-workflow: created Pages with build_type=workflow (${label})`)
    return true
  }
  console.error(`ensure-pages-workflow: POST failed (${label})`, res.status, text?.slice(0, 800))
  return false
}

async function tryToken(token, label) {
  const { res, json } = await getJson(token)
  if (res.status === 200) {
    if (json?.build_type === 'workflow') {
      console.log(`ensure-pages-workflow: already workflow (${label})`)
      return true
    }
    console.log(`ensure-pages-workflow: switching ${json?.build_type ?? '?'} → workflow (${label})`)
    return putWorkflow(token, label)
  }
  if (res.status === 404) {
    return postWorkflow(token, label)
  }
  console.error('ensure-pages-workflow: GET /pages', res.status, json ?? '')
  return false
}

async function main() {
  if (await tryToken(tokA, 'GITHUB_TOKEN')) return
  if (tokB && tokB !== tokA) {
    console.error('ensure-pages-workflow: retry with PAGES_ADMIN_TOKEN')
    if (await tryToken(tokB, 'PAGES_ADMIN_TOKEN')) return
  }
  console.error(
    [
      'ensure-pages-workflow: could not enable Actions-based Pages.',
      'Open: https://github.com/' + repo + '/settings/pages',
      'Set Source: GitHub Actions.',
      'Optional: add repo secret PAGES_ADMIN_TOKEN (admin:repo_hook or repo admin).',
    ].join('\n'),
  )
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
