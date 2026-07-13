/** Download helpers for Satellite Intelligence custom layers. */

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadGeoJsonFile(geojson: unknown, filename: string) {
  const safe = filename.trim() || 'layer';
  const cleaned = safe.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_');
  const json = JSON.stringify(geojson, null, 2);
  triggerBrowserDownload(new Blob([json], { type: 'application/geo+json' }), `${cleaned}.geojson`);
}

export function downloadBlobUrlFile(blobUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
