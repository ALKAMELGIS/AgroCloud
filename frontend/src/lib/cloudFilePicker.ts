import {
  cloudSourceSetupHint,
  cloudUploadSourceConfigured,
  getDropboxAppKey,
  getGoogleDriveClientId,
  getGoogleDriveDeveloperKey,
  getOneDriveClientId,
  GIS_UPLOAD_FILE_EXTENSIONS,
  type CloudUploadSourceId,
} from './cloudFilePickerConfig';

type PickerHandlers = {
  onFile: (file: File) => void;
  onError: (message: string) => void;
  onBusy?: (busy: boolean) => void;
};

declare global {
  interface Window {
    gapi?: {
      load: (name: string, cb: () => void) => void;
    };
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
      picker?: {
        Action: { PICKED: string; CANCEL: string };
        ViewId: { DOCS: string };
        PickerBuilder: new () => {
          addView: (view: string) => unknown;
          setOAuthToken: (token: string) => unknown;
          setDeveloperKey: (key: string) => unknown;
          setCallback: (cb: (data: { action: string; docs?: Array<{ id: string; name: string; mimeType?: string }> }) => void) => unknown;
          build: () => { setVisible: (v: boolean) => void };
        };
      };
    };
    Dropbox?: {
      choose: (opts: {
        success: (files: Array<{ name: string; link: string; bytes: number }>) => void;
        cancel?: () => void;
        linkType?: 'preview' | 'direct';
        multiselect?: boolean;
        extensions?: string[];
      }) => void;
    };
    OneDrive?: {
      open: (opts: {
        clientId: string;
        action: 'download' | 'share' | 'query';
        multiSelect?: boolean;
        advanced?: { filter?: string };
        success: (response: { value?: Array<Record<string, unknown>> }) => void;
        cancel?: () => void;
        error?: (e: unknown) => void;
      }) => void;
    };
  }
}

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string, id?: string, dataset?: Record<string, string>): Promise<void> {
  const key = id ?? src;
  const existing = scriptPromises.get(key);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    if (id && document.getElementById(id)) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    if (id) el.id = id;
    if (dataset) {
      Object.entries(dataset).forEach(([k, v]) => el.setAttribute(k, v));
    }
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
  scriptPromises.set(key, promise);
  return promise;
}

function guessMimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'geojson' || ext === 'json') return 'application/geo+json';
  if (ext === 'kml') return 'application/vnd.google-earth.kml+xml';
  if (ext === 'kmz') return 'application/vnd.google-earth.kmz';
  if (ext === 'zip') return 'application/zip';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
  return 'application/octet-stream';
}

async function blobToFile(blob: Blob, name: string): Promise<File> {
  const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : guessMimeFromName(name);
  return new File([blob], name, { type });
}

async function downloadUrlToFile(url: string, name: string, init?: RequestInit): Promise<File> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  return blobToFile(blob, name);
}

async function pickGoogleDrive({ onFile, onError, onBusy }: PickerHandlers): Promise<void> {
  const clientId = getGoogleDriveClientId();
  if (!clientId) {
    onError(cloudSourceSetupHint('gdrive'));
    return;
  }
  const developerKey = getGoogleDriveDeveloperKey();

  onBusy?.(true);
  try {
    await loadScript('https://apis.google.com/js/api.js');
    await loadScript('https://accounts.google.com/gsi/client');

    await new Promise<void>((resolve, reject) => {
      if (!window.gapi?.load) {
        reject(new Error('Google API failed to load'));
        return;
      }
      window.gapi.load('picker', () => resolve());
    });

    const oauth = window.google?.accounts?.oauth2;
    const pickerNs = window.google?.picker;
    if (!oauth || !pickerNs) {
      onError('Google sign-in / Picker is unavailable in this browser.');
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tokenClient = oauth.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.readonly',
        callback: async resp => {
          if (resp.error || !resp.access_token) {
            reject(new Error(resp.error || 'Google sign-in was cancelled.'));
            return;
          }
          const accessToken = resp.access_token;

          try {
            const builder = new pickerNs.PickerBuilder();
            builder.addView(pickerNs.ViewId.DOCS);
            builder.setOAuthToken(accessToken);
            if (developerKey) builder.setDeveloperKey(developerKey);
            builder.setCallback(async data => {
              if (data.action !== pickerNs.Action.PICKED || !data.docs?.length) {
                if (data.action === pickerNs.Action.CANCEL) resolve();
                return;
              }
              const doc = data.docs[0];
              try {
                onBusy?.(true);
                const exportMime = doc.mimeType?.includes('google-apps')
                  ? 'application/vnd.google-apps.document'
                  : null;
                let file: File;
                if (exportMime) {
                  onError('Google Docs/Sheets cannot be imported directly — export as GeoJSON/KML/ZIP from Drive first.');
                  resolve();
                  return;
                }
                const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(doc.id)}?alt=media`;
                file = await downloadUrlToFile(url, doc.name, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                onFile(file);
                resolve();
              } catch (e) {
                reject(e instanceof Error ? e : new Error('Failed to download from Google Drive.'));
              } finally {
                onBusy?.(false);
              }
            });
            builder.build().setVisible(true);
          } catch (e) {
            reject(e instanceof Error ? e : new Error('Google Picker failed.'));
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Google Drive picker failed.');
  } finally {
    onBusy?.(false);
  }
}

async function ensureDropbox(): Promise<void> {
  const appKey = getDropboxAppKey();
  if (!appKey) throw new Error(cloudSourceSetupHint('dropbox'));
  await loadScript('https://www.dropbox.com/static/api/2/dropins.js', 'dropboxjs', { 'data-app-key': appKey });
  if (!window.Dropbox?.choose) throw new Error('Dropbox Chooser failed to load.');
}

async function pickDropbox({ onFile, onError, onBusy }: PickerHandlers): Promise<void> {
  try {
    await ensureDropbox();
    onBusy?.(true);
    window.Dropbox!.choose({
      linkType: 'direct',
      multiselect: false,
      extensions: [...GIS_UPLOAD_FILE_EXTENSIONS],
      cancel: () => onBusy?.(false),
      success: async files => {
        const picked = files[0];
        if (!picked?.link) {
          onError('Dropbox did not return a file link.');
          onBusy?.(false);
          return;
        }
        try {
          const file = await downloadUrlToFile(picked.link, picked.name);
          onFile(file);
        } catch {
          onError(
            `Could not download "${picked.name}" from Dropbox in the browser. Open the From URL tab and paste the shared link instead.`,
          );
        } finally {
          onBusy?.(false);
        }
      },
    });
  } catch (e) {
    onBusy?.(false);
    onError(e instanceof Error ? e.message : 'Dropbox picker failed.');
  }
}

async function ensureOneDrive(): Promise<void> {
  await loadScript('https://js.live.net/v7.2/OneDrive.js');
  if (!window.OneDrive?.open) throw new Error('OneDrive picker failed to load.');
}

async function pickOneDrive({ onFile, onError, onBusy }: PickerHandlers): Promise<void> {
  const clientId = getOneDriveClientId();
  if (!clientId) {
    onError(cloudSourceSetupHint('onedrive'));
    return;
  }
  try {
    await ensureOneDrive();
    onBusy?.(true);
    window.OneDrive!.open({
      clientId,
      action: 'download',
      multiSelect: false,
      advanced: {
        filter: GIS_UPLOAD_FILE_EXTENSIONS.join(','),
      },
      cancel: () => onBusy?.(false),
      error: e => {
        onBusy?.(false);
        onError(typeof e === 'string' ? e : 'OneDrive picker failed.');
      },
      success: async response => {
        const item = response.value?.[0];
        const downloadUrl = item?.['@microsoft.graph.downloadUrl'];
        const name = typeof item?.name === 'string' ? item.name : 'onedrive-layer';
        if (typeof downloadUrl !== 'string') {
          onError('OneDrive did not return a download URL.');
          onBusy?.(false);
          return;
        }
        try {
          const file = await downloadUrlToFile(downloadUrl, name);
          onFile(file);
        } catch {
          onError(`Could not download "${name}" from OneDrive. Try the From URL tab with a sharing link.`);
        } finally {
          onBusy?.(false);
        }
      },
    });
  } catch (e) {
    onBusy?.(false);
    onError(e instanceof Error ? e.message : 'OneDrive picker failed.');
  }
}

export async function pickCloudUploadFile(
  source: Exclude<CloudUploadSourceId, 'device'>,
  handlers: PickerHandlers,
): Promise<void> {
  if (!cloudUploadSourceConfigured(source)) {
    handlers.onError(cloudSourceSetupHint(source));
    return;
  }
  if (source === 'gdrive') return pickGoogleDrive(handlers);
  if (source === 'dropbox') return pickDropbox(handlers);
  if (source === 'onedrive') return pickOneDrive(handlers);
}
