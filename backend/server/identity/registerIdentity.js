import { initIdentityDatabase, isIdentityReady } from './db.js'
import { registerIdentityRoutes } from './identityRoutes.js'

export async function bootstrapIdentity(app) {
  const ready = await initIdentityDatabase()
  if (ready) {
    registerIdentityRoutes(app)
    console.info('[identity] identity module ready (SQLite)')
  } else {
    console.info('[identity] off — admin-directory auth (set AGROCLOUD_IDENTITY=on to enable the identity module)')
  }
  return ready
}

export { isIdentityReady }
