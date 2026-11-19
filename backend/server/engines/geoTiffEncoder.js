/**
 * Minimal classic (little-endian) GeoTIFF encoder for a chunky, uncompressed,
 * multi-band Int16 image. Produces output that GDAL/rasterio reads reliably —
 * geotiff.js's writeArrayBuffer output is rejected by rasterio for multi-band
 * Int16 stacks, so we emit the bytes ourselves.
 *
 * @param {Int16Array} interleaved Pixel-interleaved samples (length = width*height*samples).
 * @param {number} width
 * @param {number} height
 * @param {number} samples Bands per pixel (e.g. 18).
 * @param {number[]} bbox3857 [minX, minY, maxX, maxY] in EPSG:3857.
 * @returns {Buffer}
 */
export function encodeChunkyInt16GeoTiff(interleaved, width, height, samples, bbox3857) {
  const NUM_ENTRIES = 15
  const ifdOffset = 8
  const ifdSize = 2 + NUM_ENTRIES * 12 + 4
  const outBase = ifdOffset + ifdSize

  const outChunks = []
  let outCursor = 0
  const addOut = buf => {
    const off = outBase + outCursor
    outChunks.push(buf)
    outCursor += buf.length
    return off
  }

  const bitsBuf = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) bitsBuf.writeUInt16LE(16, i * 2)
  const bitsOff = addOut(bitsBuf)

  const sfBuf = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i += 1) sfBuf.writeUInt16LE(2, i * 2) // signed int
  const sfOff = addOut(sfBuf)

  const [minX, minY, maxX, maxY] = bbox3857
  const psBuf = Buffer.alloc(24)
  psBuf.writeDoubleLE((maxX - minX) / width, 0)
  psBuf.writeDoubleLE((maxY - minY) / height, 8)
  psBuf.writeDoubleLE(0, 16)
  const psOff = addOut(psBuf)

  const tpBuf = Buffer.alloc(48)
  ;[0, 0, 0, minX, maxY, 0].forEach((v, i) => tpBuf.writeDoubleLE(v, i * 8))
  const tpOff = addOut(tpBuf)

  // GeoKeyDirectory: projected CS EPSG:3857, pixel-is-area.
  const gk = [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, 3857]
  const gkBuf = Buffer.alloc(gk.length * 2)
  gk.forEach((v, i) => gkBuf.writeUInt16LE(v, i * 2))
  const gkOff = addOut(gkBuf)

  const ndBuf = Buffer.from('-9999\0', 'latin1')
  const ndOff = addOut(ndBuf)

  const pixOffset = outBase + outCursor
  const pixBuf = Buffer.from(interleaved.buffer, interleaved.byteOffset, interleaved.byteLength)
  const stripByteCount = pixBuf.length

  const ifd = Buffer.alloc(ifdSize)
  ifd.writeUInt16LE(NUM_ENTRIES, 0)
  let e = 2
  const entry = (tag, type, count, valOrOff) => {
    ifd.writeUInt16LE(tag, e)
    ifd.writeUInt16LE(type, e + 2)
    ifd.writeUInt32LE(count, e + 4)
    ifd.writeUInt32LE(valOrOff >>> 0, e + 8)
    e += 12
  }
  entry(256, 3, 1, width) // ImageWidth
  entry(257, 3, 1, height) // ImageLength
  entry(258, 3, samples, bitsOff) // BitsPerSample
  entry(259, 3, 1, 1) // Compression = none
  entry(262, 3, 1, 1) // Photometric = BlackIsZero
  entry(273, 4, 1, pixOffset) // StripOffsets
  entry(277, 3, 1, samples) // SamplesPerPixel
  entry(278, 4, 1, height) // RowsPerStrip
  entry(279, 4, 1, stripByteCount) // StripByteCounts
  entry(284, 3, 1, 1) // PlanarConfiguration = chunky
  entry(339, 3, samples, sfOff) // SampleFormat
  entry(33550, 12, 3, psOff) // ModelPixelScale
  entry(33922, 12, 6, tpOff) // ModelTiepoint
  entry(34735, 3, 16, gkOff) // GeoKeyDirectory
  entry(42113, 2, 6, ndOff) // GDAL_NODATA
  ifd.writeUInt32LE(0, e) // next IFD

  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00])
  return Buffer.concat([header, ifd, ...outChunks, pixBuf])
}
