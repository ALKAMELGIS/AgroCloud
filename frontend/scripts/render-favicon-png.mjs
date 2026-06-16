/**
 * Raster favicons from public/agrocloud-logo.png (requires sharp).
 */
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '../public')
const repoRoot = path.join(__dirname, '../..')
const logoPath = path.join(pub, 'agrocloud-logo.png')

if (!fs.existsSync(logoPath)) {
  console.error('Missing', logoPath)
  process.exit(1)
}

const fit = { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }

await sharp(logoPath).resize(32, 32, fit).png().toFile(path.join(pub, 'favicon-32x32.png'))
await sharp(logoPath).resize(16, 16, fit).png().toFile(path.join(pub, 'favicon-16x16.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-32x32.png'), path.join(pub, 'favicon.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-32x32.png'), path.join(repoRoot, 'favicon.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-32x32.png'), path.join(repoRoot, 'favicon-32x32.png'))
await fs.promises.copyFile(path.join(pub, 'favicon-16x16.png'), path.join(repoRoot, 'favicon-16x16.png'))

console.log('Wrote favicon PNGs under frontend/public and repo root')
