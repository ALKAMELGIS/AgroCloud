/**
 * SHA-256 with a secure-context-independent fallback.
 *
 * `crypto.subtle` (Web Crypto) is only available in secure contexts — HTTPS or localhost.
 * When the app is opened over plain HTTP (e.g. http://www.eliteagrocloud.com), `crypto.subtle`
 * is `undefined`, so `crypto.subtle.digest('SHA-256', …)` throws
 * "Cannot read properties of undefined (reading 'digest')" and blocks login.
 *
 * We prefer the native implementation when available and fall back to a small pure-JS SHA-256
 * otherwise. Both paths produce byte-for-byte identical digests, so previously stored password
 * hashes (hex or base64) remain valid regardless of which path computed them.
 */

function nativeSubtle(): SubtleCrypto | undefined {
  try {
    const c = (globalThis as { crypto?: Crypto }).crypto
    return c && typeof c.subtle?.digest === 'function' ? c.subtle : undefined
  } catch {
    return undefined
  }
}

/** Pure-JS SHA-256. Returns the 32-byte digest of `bytes`. */
function sha256Fallback(bytes: Uint8Array): Uint8Array {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ])

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])

  const bitLen = bytes.length * 8
  // message + 0x80 + padding zeros + 8-byte big-endian length, total multiple of 64 bytes
  const withOne = bytes.length + 1
  const paddedLen = withOne + ((56 - (withOne % 64) + 64) % 64) + 8
  const msg = new Uint8Array(paddedLen)
  msg.set(bytes)
  msg[bytes.length] = 0x80
  // 64-bit length (we only need the low 32 bits for realistic password lengths)
  const dv = new DataView(msg.buffer)
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false)
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false)

  const w = new Uint32Array(64)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7]

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (hh + S1 + ch + K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }

  const out = new Uint8Array(32)
  const outDv = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) outDv.setUint32(i * 4, h[i], false)
  return out
}

/** SHA-256 digest of a UTF-8 string, returned as a 32-byte array. */
export async function sha256Bytes(value: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(value)
  const subtle = nativeSubtle()
  if (subtle) {
    try {
      const buffer = await subtle.digest('SHA-256', data)
      return new Uint8Array(buffer)
    } catch {
      // Fall through to JS implementation on unexpected failure.
    }
  }
  return sha256Fallback(data)
}

/** SHA-256 digest of a UTF-8 string as lowercase hex. */
export async function sha256Hex(value: string): Promise<string> {
  const bytes = await sha256Bytes(value)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

/** SHA-256 digest of a UTF-8 string as base64. */
export async function sha256Base64(value: string): Promise<string> {
  const bytes = await sha256Bytes(value)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
