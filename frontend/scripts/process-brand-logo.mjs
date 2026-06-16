/**
 * One-off: copy brand PNG, remove near-white background, write agrocloud-logo.png.
 * Usage: node scripts/process-brand-logo.mjs [source.png]
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
const defaultSrc = path.join(
  __dirname,
  '../../../.cursor/projects/c-Users-mohamed-abass-WUSOOM-OneDrive-WUSOOM-Projects-AgroCloud-main/assets/c__Users_mohamed.abass.WUSOOM_AppData_Roaming_Cursor_User_workspaceStorage_f830f870ee72b8642b5a4b52cd166415_images_Gemini_Generated_Image_i9sm01i9sm01i9sm-63805230-13db-434f-9169-716c4fff5b2b.png',
)

const src = process.argv[2] ? path.resolve(process.argv[2]) : defaultSrc
const out = path.join(pub, 'agrocloud-logo.png')

if (!fs.existsSync(src)) {
  console.error('Missing source:', src)
  process.exit(1)
}

const THRESHOLD = 248

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

for (let i = 0; i < data.length; i += 4) {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
    data[i + 3] = 0
  }
}

await sharp(data, { raw: info }).png().toFile(out)
console.log('Wrote', out, `(${info.width}x${info.height}, transparent background)`)

const coreOut = path.join(pub, 'agrocloud-logo-core.png')
const top = Math.floor(info.height * 0.22)
const coreH = info.height - top
await sharp(out)
  .extract({ left: 0, top, width: info.width, height: coreH })
  .png()
  .toFile(coreOut)
console.log('Wrote', coreOut, `(leaves + ring, no baked drone)`)
