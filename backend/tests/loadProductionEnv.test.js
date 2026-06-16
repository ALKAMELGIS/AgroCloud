import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeProductionEnv,
  resolveAgriDataPaths,
} from '../server/loadProductionEnv.js'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))

function withEnv(overrides, fn) {
  const prev = { ...process.env }
  Object.assign(process.env, overrides)
  try {
    return fn()
  } finally {
    process.env = prev
  }
}

test('normalizeProductionEnv maps DEEPSEEK and AGRI_DATA_DIR', () => {
  withEnv(
    {
      DEEPSEEK: 'sk-test',
      AGRI_DATA_DIR: '/data/agro',
      NODE_ENV: 'production',
    },
    () => {
      normalizeProductionEnv()
      assert.equal(process.env.DEEPSEEK_API_KEY, 'sk-test')
      assert.equal(process.env.VITE_DEEPSEEK_API_KEY, 'sk-test')
      assert.equal(
        process.env.AGRI_API_SECRETS_FILE,
        path.join('/data/agro', 'agri_api_secrets.json'),
      )
    },
  )
})

test('normalizeProductionEnv mirrors MAPBOX_TOKEN to VITE_MAPBOX_TOKEN', () => {
  withEnv({ MAPBOX_TOKEN: 'pk.test' }, () => {
    normalizeProductionEnv()
    assert.equal(process.env.VITE_MAPBOX_TOKEN, 'pk.test')
    assert.equal(process.env.VITE_MAPBOX_ACCESS_TOKEN, 'pk.test')
  })
})

test('resolveAgriDataPaths uses AGRI_DATA_DIR-derived files', () => {
  withEnv(
    {
      AGRI_API_SECRETS_FILE: '/data/agro/agri_api_secrets.json',
      AGRI_USER_PROFILES_FILE: '/data/agro/agri_user_profiles.json',
      AGRI_ADMIN_DIRECTORY_FILE: '/data/agro/agri_admin_directory.json',
    },
    () => {
      const paths = resolveAgriDataPaths(SERVER_DIR)
      assert.equal(paths.apiSecretsFile, '/data/agro/agri_api_secrets.json')
      assert.equal(paths.userProfilesFile, '/data/agro/agri_user_profiles.json')
      assert.equal(paths.adminDirectoryFile, '/data/agro/agri_admin_directory.json')
    },
  )
})
