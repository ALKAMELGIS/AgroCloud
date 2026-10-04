import { initIdentityDatabase, isIdentityReady } from './db.js'
import { registerIdentityRoutes } from './identityRoutes.js'

export async function bootstrapIdentity(app) {
  const ready = await initIdentityDatabase()
  if (ready) {
    registerIdentityRoutes(app)
    console.info('[identity] PostgreSQL identity module ready')
  } else {
    console.info('[identity] DATABASE_URL not set or schema missing — JSON directory auth only')
  }
  return ready
}

export { isIdentityReady }
