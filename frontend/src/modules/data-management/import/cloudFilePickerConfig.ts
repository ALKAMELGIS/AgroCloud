/** Browser cloud upload pickers — optional VITE_* keys (see `.env.example`). */

export type CloudUploadSourceId = 'device' | 'gdrive' | 'dropbox' | 'onedrive';

export function getGoogleDriveClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? '').trim();
}

/** Google Cloud API key (Picker + some Drive calls). Falls back to Maps key when set. */
export function getGoogleDriveDeveloperKey(): string {
  const drive = String(import.meta.env.VITE_GOOGLE_DRIVE_API_KEY ?? '').trim();
  if (drive) return drive;
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? import.meta.env.VITE_GOOGLE_MAPS_SERVER_API_KEY ?? '').trim();
}

export function getDropboxAppKey(): string {
  return String(import.meta.env.VITE_DROPBOX_APP_KEY ?? '').trim();
}

export function getOneDriveClientId(): string {
  return String(import.meta.env.VITE_ONEDRIVE_CLIENT_ID ?? '').trim();
}

export function cloudUploadSourceConfigured(id: Exclude<CloudUploadSourceId, 'device'>): boolean {
  if (id === 'gdrive') return Boolean(getGoogleDriveClientId());
  if (id === 'dropbox') return Boolean(getDropboxAppKey());
  if (id === 'onedrive') return Boolean(getOneDriveClientId());
  return false;
}

export const GIS_UPLOAD_FILE_EXTENSIONS = [
  '.geojson',
  '.json',
  '.kml',
  '.kmz',
  '.zip',
  '.csv',
  '.tif',
  '.tiff',
  '.gpkg',
  '.shp',
] as const;

export function cloudSourceSetupHint(id: Exclude<CloudUploadSourceId, 'device'>): string {
  switch (id) {
    case 'gdrive':
      return 'Google Drive is not configured. Set VITE_GOOGLE_DRIVE_CLIENT_ID (OAuth web client) in .env and enable the Google Drive API.';
    case 'dropbox':
      return 'Dropbox is not configured. Set VITE_DROPBOX_APP_KEY in .env (Dropbox app — Chooser domain).';
    case 'onedrive':
      return 'OneDrive is not configured. Set VITE_ONEDRIVE_CLIENT_ID in .env (Azure app registration).';
    default:
      return 'Cloud source is not configured.';
  }
}
