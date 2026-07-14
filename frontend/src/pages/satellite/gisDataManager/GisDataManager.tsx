import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GisUploadCloudSources } from '../../../components/GisUploadCloudSources';
import {
  listDbConnections,
  saveDbConnection,
  testDbConnection,
  fetchDbTables,
  deleteDbConnection,
} from '../../../lib/gisConnections/dbConnectionStore';
import type { GisDbConnectionProfile, GisConnectionKind } from '../../../lib/gisConnections/types';
import {
  listRecent,
  listFavorites,
  pushRecent,
  toggleFavorite,
  isFavorite,
} from '../../../lib/gisConnections/recentFavoritesStore';
import {
  listWebServices,
  saveWebService,
  deleteWebService,
  suggestServiceKindFromUrl,
} from '../../../lib/gisConnections/webServiceStore';
import { parseWfsGetCapabilities, fetchWfsGeoJson } from '../../../lib/gisConnections/ogcWfsClient';
import {
  VECTOR_ACCEPT,
  RASTER_ACCEPT,
  VECTOR_FORMAT_LABEL_LIST,
  RASTER_FORMAT_LABEL_LIST,
} from '../../../lib/gisIngest/formats';
import { isShapefilePart, zipShapefileParts } from '../../../lib/gisIngest/shapefileBundle';
import {
  buildVectorPreview,
  buildStubPreview,
  buildValidationIssues,
  type VectorPreviewInfo,
} from '../../../lib/gisIngest/gisPreview';
import { parseFile } from '../../../utils/FileLoader';
import {
  GIS_DM_CATEGORIES,
  WIZARD_STEPS,
  type GisDataManagerCallbacks,
  type GisDataManagerCategory,
  type GisDataManagerPortalItem,
  type GisDataManagerToast,
  type GisImportWizardStep,
} from './gisDataManagerTypes';
import './GisDataManager.css';

type Props = GisDataManagerCallbacks & {
  open: boolean;
  onClose: () => void;
  portalItems: GisDataManagerPortalItem[];
  initialCategory?: GisDataManagerCategory;
  anchorId?: string;
  statusExternal?: string;
};

const DB_KIND_OPTIONS: { value: GisConnectionKind; label: string; port: number }[] = [
  { value: 'postgres', label: 'PostgreSQL + PostGIS', port: 5432 },
  { value: 'sqlserver', label: 'Microsoft SQL Server', port: 1433 },
  { value: 'oracle', label: 'Oracle Spatial', port: 1521 },
  { value: 'mysql', label: 'MySQL Spatial', port: 3306 },
  { value: 'mariadb', label: 'MariaDB', port: 3306 },
  { value: 'sqlite', label: 'SQLite / SpatiaLite', port: 0 },
  { value: 'duckdb', label: 'DuckDB Spatial', port: 0 },
  { value: 'mongodb', label: 'MongoDB GeoJSON', port: 27017 },
  { value: 'bigquery', label: 'BigQuery GIS', port: 443 },
  { value: 'snowflake', label: 'Snowflake Spatial', port: 443 },
  { value: 'saphana', label: 'SAP HANA Spatial', port: 443 },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function WorkspaceSection({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="gis-dm-section-title">{title}</h3>
      {lead ? <p className="gis-dm-lead">{lead}</p> : null}
      {children}
    </div>
  );
}

function ComingSoon({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="gis-dm-stub" role="status">
      <i className="fa-solid fa-screwdriver-wrench" aria-hidden />
      <h3 className="gis-dm-section-title">{label}</h3>
      <p className="gis-dm-lead">{hint || 'This category is on the enterprise roadmap and requires gateway support.'}</p>
    </div>
  );
}

export function GisDataManager({
  open,
  onClose,
  portalItems,
  initialCategory = 'vector',
  anchorId = 'map-toolbox-add-gis-layer-btn',
  statusExternal,
  onImportFiles,
  onImportRemoteUrl,
  onConnectArcGis,
  onAddDiscoveredArcGis,
  onDiscoverArcGis,
  onAddPortalRow,
  onSaveDbProfile,
  onImportWfs,
  onImportOgcTile,
  addingPortalRowId,
  discoveredArcGisLayers = [],
  selectedDiscoveredArcGisUrl = '',
  onSelectDiscoveredArcGisUrl,
  isConnecting,
  isAddingDiscovered,
  isImportingRemote,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<GisDataManagerCategory>(initialCategory);
  const [search, setSearch] = useState('');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [wizardStep, setWizardStep] = useState<GisImportWizardStep>('source');
  const [layerName, setLayerName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [arcgisUrl, setArcgisUrl] = useState('');
  const [arcgisToken, setArcgisToken] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<VectorPreviewInfo | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [zoomToLayer, setZoomToLayer] = useState(true);
  const [toasts, setToasts] = useState<GisDataManagerToast[]>([]);
  const [dbKind, setDbKind] = useState<GisConnectionKind>('postgres');
  const [dbHost, setDbHost] = useState('localhost');
  const [dbPort, setDbPort] = useState('5432');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPass, setDbPass] = useState('');
  const [dbSsl, setDbSsl] = useState(true);
  const [dbConnName, setDbConnName] = useState('');
  const [dbProfiles, setDbProfiles] = useState(() => listDbConnections());
  const [dbTablesMsg, setDbTablesMsg] = useState('');
  const [webUrl, setWebUrl] = useState('');
  const [webToken, setWebToken] = useState('');
  const [wfsLayers, setWfsLayers] = useState<{ name: string; title: string }[]>([]);
  const [wfsTypeName, setWfsTypeName] = useState('');
  const [webServices, setWebServices] = useState(() => listWebServices());
  const [recentTick, setRecentTick] = useState(0);
  const [size, setSize] = useState({ w: 920, h: 620 });
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const pushToast = useCallback((tone: GisDataManagerToast['tone'], message: string) => {
    const id = uid('toast');
    setToasts(prev => [...prev.slice(-4), { id, tone, message }]);
    window.setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200);
  }, []);

  useEffect(() => {
    if (!open) return;
    setCategory(initialCategory);
    setWizardStep('source');
  }, [open, initialCategory]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = document.getElementById(anchorId);
      const margin = 12;
      const w = size.w;
      const h = size.h;
      let left = window.innerWidth - w - margin;
      let top = 96;
      if (anchor) {
        const ar = anchor.getBoundingClientRect();
        left = Math.max(margin, ar.left - w - 10);
        top = Math.max(margin, Math.min(ar.top, window.innerHeight - h - margin));
      }
      if (left + w > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - w - margin);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorId, size.w, size.h]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return GIS_DM_CATEGORIES;
    return GIS_DM_CATEGORIES.filter(
      c => c.label.toLowerCase().includes(q) || c.id.includes(q) || (c.hint || '').toLowerCase().includes(q),
    );
  }, [search]);

  const recentItems = useMemo(() => {
    void recentTick;
    return listRecent();
  }, [recentTick]);

  const favoriteItems = useMemo(() => {
    void recentTick;
    return listFavorites();
  }, [recentTick]);

  const acceptForCategory = category === 'raster' ? RASTER_ACCEPT : category === 'bim' ? '.ifc' : VECTOR_ACCEPT;

  const stageIncomingFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      let next = [...files];
      const shpParts = next.filter(f => isShapefilePart(f.name));
      if (shpParts.some(f => f.name.toLowerCase().endsWith('.shp')) && !next.some(f => f.name.toLowerCase().endsWith('.zip'))) {
        try {
          const zipped = await zipShapefileParts(shpParts);
          next = [zipped, ...next.filter(f => !isShapefilePart(f.name))];
          pushToast('ok', `Packaged shapefile parts into ${zipped.name}`);
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Could not package shapefile parts');
          return;
        }
      }
      setStagedFiles(next);
      setWizardStep('preview');
      setPreviewBusy(true);
      setProgressPct(8);
      try {
        const primary = next[0];
        if (category === 'raster' || /\.(tif|tiff|png|jpe?g|webp|gif|bmp)$/i.test(primary.name)) {
          setPreview(
            buildStubPreview({
              filename: primary.name,
              bytes: primary.size,
              geometryType: 'raster',
              crsHint: 'Raster — georeferencing checked on import',
            }),
          );
          setWizardStep('validation');
        } else if (/\.ifc$/i.test(primary.name)) {
          setPreview(
            buildStubPreview({
              filename: primary.name,
              bytes: primary.size,
              geometryType: 'bim',
              crsHint: 'IFC footprint anchor',
              featureCount: 1,
              fields: ['IFC'],
            }),
          );
          setWizardStep('validation');
        } else {
          const parsed = await parseFile(primary, {
            onProgress: pct => setProgressPct(Math.round(8 + pct * 0.5)),
          });
          if (parsed.type === 'geojson') {
            const info = buildVectorPreview(parsed.data, primary.name, primary.size, parsed.crsHint);
            setPreview(info);
            const issues = buildValidationIssues(info);
            if (issues.some(i => i.severity === 'error')) setWizardStep('validation');
            else setWizardStep('projection');
          } else if (parsed.type === 'table') {
            setPreview(
              buildStubPreview({
                filename: primary.name,
                bytes: primary.size,
                geometryType: 'table',
                crsHint: 'No coordinates detected',
                featureCount: parsed.data.length,
                fields: parsed.data[0] ? Object.keys(parsed.data[0] as object) : [],
              }),
            );
            setWizardStep('validation');
            pushToast('warn', 'Table has no lat/lon or WKT columns yet — map import needs coordinates.');
          } else if (parsed.type === 'raster') {
            setPreview(
              buildStubPreview({
                filename: primary.name,
                bytes: primary.size,
                geometryType: 'raster',
                crsHint: parsed.crsHint || 'Raster',
                fields: [`${parsed.widthPx}×${parsed.heightPx}`, `${parsed.bands} bands`],
              }),
            );
            setWizardStep('validation');
          } else if (parsed.type === 'bim') {
            setPreview(
              buildStubPreview({
                filename: primary.name,
                bytes: parsed.byteLength,
                geometryType: 'bim',
                crsHint: 'IFC',
                featureCount: 1,
                fields: ['IFC'],
              }),
            );
            setWizardStep('validation');
          }
        }
        pushRecent({
          id: uid('recent'),
          title: next[0].name,
          category: category === 'raster' ? 'raster' : category === 'bim' ? 'bim' : 'vector',
          detail: `${(next[0].size / 1024).toFixed(1)} KB`,
          savedAt: new Date().toISOString(),
        });
        setRecentTick(t => t + 1);
      } catch (err) {
        pushToast('error', err instanceof Error ? err.message : 'Preview failed');
        setWizardStep('source');
      } finally {
        setPreviewBusy(false);
        setProgressPct(0);
      }
    },
    [category, pushToast],
  );

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    await stageIncomingFiles(Array.from(files));
  };

  const runImport = async () => {
    if (!stagedFiles.length) {
      pushToast('warn', 'Choose a file first');
      return;
    }
    setImportBusy(true);
    setWizardStep('import');
    setProgressPct(20);
    try {
      await onImportFiles(stagedFiles, {
        layerName: layerName.trim() || undefined,
        forceRaster: category === 'raster',
      });
      setProgressPct(100);
      setWizardStep('ready');
      pushToast('ok', `Imported ${layerName.trim() || stagedFiles[0].name}`);
      setStagedFiles([]);
      setPreview(null);
      setLayerName('');
    } catch (err) {
      setWizardStep('validation');
      pushToast('error', err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const validationIssues = preview ? buildValidationIssues(preview) : [];

  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
    const onMove = (ev: PointerEvent) => {
      const s = resizeRef.current;
      if (!s) return;
      setSize({
        w: Math.max(640, Math.min(window.innerWidth - 24, s.w + (ev.clientX - s.x))),
        h: Math.max(420, Math.min(window.innerHeight - 24, s.h + (ev.clientY - s.y))),
      });
    };
    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!open) return null;

  const renderWorkspace = () => {
    if (category === 'recent') {
      return (
        <WorkspaceSection title="Recent sources" lead="Recently imported or connected data sources on this browser.">
          <div className="gis-dm-card-list">
            {recentItems.length === 0 ? <p className="gis-dm-lead">No recent sources yet.</p> : null}
            {recentItems.map(item => (
              <div key={item.id} className="gis-dm-card">
                <i className="fa-solid fa-clock" aria-hidden />
                <div className="gis-dm-card-main">
                  <div className="gis-dm-card-title">{item.title}</div>
                  <div className="gis-dm-card-meta">
                    {item.category}
                    {item.detail ? ` · ${item.detail}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="gis-dm-icon-btn"
                  title={isFavorite(item.id) ? 'Unfavorite' : 'Favorite'}
                  onClick={() => {
                    toggleFavorite(item);
                    setRecentTick(t => t + 1);
                  }}
                >
                  <i className={`fa-${isFavorite(item.id) ? 'solid' : 'regular'} fa-star`} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        </WorkspaceSection>
      );
    }

    if (category === 'favorites') {
      return (
        <WorkspaceSection title="Favorites" lead="Pin databases, services, and files you use often.">
          <div className="gis-dm-card-list">
            {favoriteItems.length === 0 ? <p className="gis-dm-lead">No favorites yet.</p> : null}
            {favoriteItems.map(item => (
              <div key={item.id} className="gis-dm-card">
                <i className="fa-solid fa-star" aria-hidden />
                <div className="gis-dm-card-main">
                  <div className="gis-dm-card-title">{item.title}</div>
                  <div className="gis-dm-card-meta">{item.category}</div>
                </div>
              </div>
            ))}
          </div>
        </WorkspaceSection>
      );
    }

    if (category === 'giscontent') {
      return (
        <WorkspaceSection title="GIS Content" lead="Hosted feature layers saved in this browser portal.">
          <div className="gis-dm-card-list">
            {portalItems.length === 0 ? (
              <p className="gis-dm-lead">No hosted layers yet. Publish from GIS Content or import a file.</p>
            ) : null}
            {portalItems.map(item => {
              const busy = addingPortalRowId === item.id;
              return (
                <div key={item.id} className="gis-dm-card">
                  <i className="fa-solid fa-layer-group" aria-hidden />
                  <div className="gis-dm-card-main">
                    <div className="gis-dm-card-title">{item.title}</div>
                    <div className="gis-dm-card-meta">{item.typeLabel} · Hosted</div>
                  </div>
                  <button
                    type="button"
                    className="gis-dm-btn gis-dm-btn--primary"
                    disabled={!!busy}
                    onClick={() => {
                      onAddPortalRow(item.row);
                      pushToast('ok', `Adding ${item.title}`);
                    }}
                  >
                    {busy ? 'Adding…' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </WorkspaceSection>
      );
    }

    if (category === 'vector' || category === 'raster' || category === 'bim') {
      const labels =
        category === 'raster' ? [...RASTER_FORMAT_LABEL_LIST] : category === 'bim' ? ['IFC'] : [...VECTOR_FORMAT_LABEL_LIST];
      return (
        <WorkspaceSection
          title={category === 'raster' ? 'Raster data' : category === 'bim' ? 'BIM / CAD' : 'Vector data'}
          lead={
            category === 'raster'
              ? 'GeoTIFF and images with world files (.tfw/.jgw/.pgw). Multi-file bundles supported.'
              : category === 'bim'
                ? 'IFC models are anchored as map footprints for GIS workflows.'
                : 'Shapefile (ZIP or multi-part), GeoJSON, TopoJSON, KML/KMZ, GPX, CSV, Excel.'
          }
        >
          <div
            className={`gis-dm-dropzone${dropActive ? ' is-active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            onDragEnter={e => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={e => {
              e.preventDefault();
              if (e.currentTarget === e.target) setDropActive(false);
            }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => void onDrop(e)}
          >
            <div className="gis-dm-dropzone-icon" aria-hidden>
              <i className="fa-solid fa-cloud-arrow-up" />
            </div>
            <p className="gis-dm-dropzone-title">Drag & drop files</p>
            <p className="gis-dm-dropzone-sub">{labels.join(' · ')}</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={acceptForCategory}
            onChange={e => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              void stageIncomingFiles(files);
            }}
          />
          <input
            ref={folderInputRef}
            type="file"
            hidden
            // @ts-expect-error webkitdirectory is non-standard but supported
            webkitdirectory=""
            multiple
            onChange={e => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              void stageIncomingFiles(files);
            }}
          />
          <div className="gis-dm-actions-row">
            <button type="button" className="gis-dm-btn" onClick={() => fileInputRef.current?.click()}>
              <i className="fa-solid fa-folder-open" aria-hidden /> Browse Files
            </button>
            <button type="button" className="gis-dm-btn" onClick={() => folderInputRef.current?.click()}>
              <i className="fa-solid fa-folder-tree" aria-hidden /> Browse Folder
            </button>
          </div>

          {category !== 'bim' ? (
            <>
              <label className="gis-dm-field" style={{ marginTop: 14 }}>
                <span>Import from URL</span>
                <input
                  className="gis-dm-input"
                  type="url"
                  placeholder="https://…/data.geojson"
                  value={remoteUrl}
                  onChange={e => setRemoteUrl(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="gis-dm-btn"
                disabled={isImportingRemote || !remoteUrl.trim()}
                onClick={() => {
                  void (async () => {
                    try {
                      await onImportRemoteUrl(remoteUrl.trim(), {
                        layerName: layerName.trim() || undefined,
                        asRaster: category === 'raster',
                      });
                      pushRecent({
                        id: uid('url'),
                        title: remoteUrl.trim(),
                        category: 'url',
                        savedAt: new Date().toISOString(),
                      });
                      setRecentTick(t => t + 1);
                      pushToast('ok', 'Remote source imported');
                    } catch (err) {
                      pushToast('error', err instanceof Error ? err.message : 'URL import failed');
                    }
                  })();
                }}
              >
                <i className="fa-solid fa-globe" aria-hidden /> {isImportingRemote ? 'Importing…' : 'Import URL'}
              </button>
            </>
          ) : null}

          {category === 'vector' || category === 'raster' ? (
            <div style={{ marginTop: 12 }}>
              <GisUploadCloudSources
                cloudOnly
                onFile={file => void stageIncomingFiles([file])}
                onStatus={msg => pushToast('info', msg)}
              />
            </div>
          ) : null}

          <label className="gis-dm-field" style={{ marginTop: 12 }}>
            <span>Layer name (optional)</span>
            <input className="gis-dm-input" value={layerName} onChange={e => setLayerName(e.target.value)} placeholder="Display name" />
          </label>
          <label className="gis-dm-inline-check">
            <input type="checkbox" checked={zoomToLayer} onChange={e => setZoomToLayer(e.target.checked)} />
            Zoom to layer after import
          </label>

          {stagedFiles.length ? (
            <div className="gis-dm-card" style={{ marginTop: 8 }}>
              <i className="fa-solid fa-file" aria-hidden />
              <div className="gis-dm-card-main">
                <div className="gis-dm-card-title">{stagedFiles.map(f => f.name).join(', ')}</div>
                <div className="gis-dm-card-meta">
                  {(stagedFiles.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
              <button
                type="button"
                className="gis-dm-btn gis-dm-btn--ghost"
                onClick={() => {
                  setStagedFiles([]);
                  setPreview(null);
                  setWizardStep('source');
                }}
              >
                Clear
              </button>
            </div>
          ) : null}

          {previewBusy ? (
            <div className="gis-dm-progress">
              <div className="gis-dm-progress__track">
                <div className="gis-dm-progress__fill" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="gis-dm-progress__label">Reading & building preview… {progressPct}%</div>
            </div>
          ) : null}

          {preview ? (
            <div className="gis-dm-preview-panel">
              <h4 className="gis-dm-preview-title">Live preview</h4>
              <dl className="gis-dm-kv">
                <dt>File</dt>
                <dd>{preview.filename}</dd>
                <dt>Type</dt>
                <dd>{preview.geometryTypes.join(', ') || '—'}</dd>
                <dt>Features</dt>
                <dd>{preview.featureCount}</dd>
                <dt>CRS</dt>
                <dd>{preview.crsHint || 'Unknown'}</dd>
                <dt>Extent</dt>
                <dd>{preview.bbox ? preview.bbox.map(n => n.toFixed(4)).join(', ') : '—'}</dd>
                <dt>Fields</dt>
                <dd>{preview.sampleFields.slice(0, 12).join(', ') || '—'}</dd>
                <dt>Memory est.</dt>
                <dd>~{(preview.memoryEstimate / (1024 * 1024)).toFixed(1)} MB</dd>
              </dl>
              <div className="gis-dm-chips">
                {validationIssues.map(issue => (
                  <span
                    key={issue.code}
                    className={`gis-dm-chip gis-dm-chip--${
                      issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warn' : 'ok'
                    }`}
                  >
                    {issue.severity === 'info' ? '✓' : issue.severity === 'warning' ? '!' : '×'} {issue.message}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="gis-dm-btn gis-dm-btn--primary"
                disabled={
                  importBusy || validationIssues.some(i => i.severity === 'error' && i.code === 'missing_features')
                }
                onClick={() => void runImport()}
              >
                <i className="fa-solid fa-circle-check" aria-hidden /> {importBusy ? 'Importing…' : 'Import to map'}
              </button>
            </div>
          ) : null}
        </WorkspaceSection>
      );
    }

    if (category === 'database') {
      return (
        <WorkspaceSection
          title="Database connections"
          lead="Save enterprise connection profiles. Live PostGIS queries run through the GIS gateway when available."
        >
          <div className="gis-dm-grid-2">
            <label className="gis-dm-field">
              <span>Platform</span>
              <select
                className="gis-dm-select"
                value={dbKind}
                onChange={e => {
                  const kind = e.target.value as GisConnectionKind;
                  setDbKind(kind);
                  const port = DB_KIND_OPTIONS.find(o => o.value === kind)?.port;
                  if (port) setDbPort(String(port));
                }}
              >
                {DB_KIND_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="gis-dm-field">
              <span>Connection name</span>
              <input className="gis-dm-input" value={dbConnName} onChange={e => setDbConnName(e.target.value)} placeholder="Production PostGIS" />
            </label>
          </div>
          <div className="gis-dm-grid-2">
            <label className="gis-dm-field">
              <span>Host / server</span>
              <input className="gis-dm-input" value={dbHost} onChange={e => setDbHost(e.target.value)} />
            </label>
            <label className="gis-dm-field">
              <span>Port</span>
              <input className="gis-dm-input" value={dbPort} onChange={e => setDbPort(e.target.value)} />
            </label>
          </div>
          <label className="gis-dm-field">
            <span>Database</span>
            <input className="gis-dm-input" value={dbName} onChange={e => setDbName(e.target.value)} />
          </label>
          <div className="gis-dm-grid-2">
            <label className="gis-dm-field">
              <span>Username</span>
              <input className="gis-dm-input" value={dbUser} onChange={e => setDbUser(e.target.value)} autoComplete="off" />
            </label>
            <label className="gis-dm-field">
              <span>Password</span>
              <input className="gis-dm-input" type="password" value={dbPass} onChange={e => setDbPass(e.target.value)} autoComplete="new-password" />
            </label>
          </div>
          <label className="gis-dm-inline-check">
            <input type="checkbox" checked={dbSsl} onChange={e => setDbSsl(e.target.checked)} />
            Use SSL / TLS
          </label>
          <div className="gis-dm-actions-row">
            <button
              type="button"
              className="gis-dm-btn"
              onClick={() => {
                void (async () => {
                  const profile: GisDbConnectionProfile = {
                    id: uid('db'),
                    name: dbConnName.trim() || `${dbKind}@${dbHost}`,
                    kind: dbKind,
                    host: dbHost.trim(),
                    port: Number(dbPort) || 0,
                    database: dbName.trim(),
                    username: dbUser.trim(),
                    password: dbPass,
                    ssl: dbSsl,
                    savedAt: new Date().toISOString(),
                    lastTestStatus: 'untested',
                  };
                  const result = await testDbConnection(profile);
                  const saved = saveDbConnection({
                    ...profile,
                    lastTestStatus: result.ok ? 'ok' : 'fail',
                    lastTestMessage: result.message,
                  });
                  setDbProfiles(listDbConnections());
                  if (onSaveDbProfile) {
                    await onSaveDbProfile({
                      platform: dbKind,
                      host: `${dbHost}:${dbPort}`,
                      database: dbName,
                      username: dbUser,
                      password: dbPass,
                      ssl: dbSsl,
                      name: saved.name,
                    });
                  }
                  pushToast(result.ok ? 'ok' : 'warn', result.message);
                  const tables = await fetchDbTables(saved);
                  setDbTablesMsg(
                    tables.tables.length
                      ? `Tables: ${tables.tables.slice(0, 12).map(t => t.name).join(', ')}`
                      : tables.message || 'Gateway required to list spatial tables.',
                  );
                })();
              }}
            >
              <i className="fa-solid fa-plug" aria-hidden /> Test & Save
            </button>
          </div>
          {dbTablesMsg ? <p className="gis-dm-lead">{dbTablesMsg}</p> : null}
          <div className="gis-dm-card-list" style={{ marginTop: 12 }}>
            {dbProfiles.map(p => (
              <div key={p.id} className="gis-dm-card">
                <i className="fa-solid fa-database" aria-hidden />
                <div className="gis-dm-card-main">
                  <div className="gis-dm-card-title">{p.name}</div>
                  <div className="gis-dm-card-meta">
                    {p.kind} · {p.host}:{p.port} / {p.database}
                    {p.lastTestStatus ? ` · ${p.lastTestStatus}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="gis-dm-btn gis-dm-btn--ghost"
                  onClick={() => {
                    deleteDbConnection(p.id);
                    setDbProfiles(listDbConnections());
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </WorkspaceSection>
      );
    }

    if (category === 'cloud') {
      return (
        <WorkspaceSection title="Cloud storage" lead="Browse OneDrive, Google Drive, and Dropbox. S3 / Azure / GCS use gateway credentials.">
          <GisUploadCloudSources
            cloudOnly
            onFile={file => {
              setCategory(/\.(tif|tiff|png|jpe?g)$/i.test(file.name) ? 'raster' : 'vector');
              void stageIncomingFiles([file]);
            }}
            onStatus={msg => pushToast('info', msg)}
          />
          <div className="gis-dm-stub" style={{ marginTop: 14 }}>
            <i className="fa-solid fa-cloud" aria-hidden />
            <p className="gis-dm-lead">AWS S3, Azure Blob, GCS, and Cloudflare R2 browsers require the enterprise GIS gateway proxy.</p>
          </div>
        </WorkspaceSection>
      );
    }

    if (category === 'web') {
      return (
        <WorkspaceSection
          title="Web services"
          lead="ArcGIS Feature/Map/Image services, OGC WMS/WMTS/WFS, XYZ tiles, and STAC endpoints."
        >
          <label className="gis-dm-field">
            <span>ArcGIS service URL</span>
            <input
              className="gis-dm-input"
              value={arcgisUrl}
              onChange={e => setArcgisUrl(e.target.value)}
              placeholder="https://…/FeatureServer/0"
            />
          </label>
          <label className="gis-dm-field">
            <span>Token (optional)</span>
            <input className="gis-dm-input" value={arcgisToken} onChange={e => setArcgisToken(e.target.value)} />
          </label>
          <div className="gis-dm-actions-row">
            <button
              type="button"
              className="gis-dm-btn gis-dm-btn--primary"
              disabled={isConnecting || !arcgisUrl.trim()}
              onClick={() => {
                void (async () => {
                  try {
                    if (onDiscoverArcGis) {
                      await onDiscoverArcGis(arcgisUrl.trim(), arcgisToken.trim() || undefined);
                    } else {
                      await onConnectArcGis(arcgisUrl.trim(), arcgisToken.trim() || undefined, layerName.trim() || undefined);
                    }
                    saveWebService({
                      id: uid('web'),
                      name: layerName.trim() || arcgisUrl.trim(),
                      kind: 'arcgis',
                      url: arcgisUrl.trim(),
                      token: arcgisToken.trim() || undefined,
                      savedAt: new Date().toISOString(),
                    });
                    setWebServices(listWebServices());
                    pushToast('ok', 'Connected to ArcGIS service');
                  } catch (err) {
                    pushToast('error', err instanceof Error ? err.message : 'ArcGIS connect failed');
                  }
                })();
              }}
            >
              {isConnecting ? 'Connecting…' : 'Connect ArcGIS'}
            </button>
          </div>
          {discoveredArcGisLayers.length > 0 ? (
            <div className="gis-dm-preview-panel">
              <h4 className="gis-dm-preview-title">{discoveredArcGisLayers.length} layer(s) found</h4>
              <select
                className="gis-dm-select"
                value={selectedDiscoveredArcGisUrl}
                onChange={e => onSelectDiscoveredArcGisUrl?.(e.target.value)}
              >
                {discoveredArcGisLayers.map(l => (
                  <option key={l.url} value={l.url}>
                    {l.name}
                    {l.geometryType ? ` (${l.geometryType})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="gis-dm-btn gis-dm-btn--primary"
                style={{ marginTop: 8 }}
                disabled={!selectedDiscoveredArcGisUrl || isAddingDiscovered}
                onClick={() => {
                  void (async () => {
                    try {
                      await onAddDiscoveredArcGis?.(selectedDiscoveredArcGisUrl);
                      pushToast('ok', 'ArcGIS layer added to map');
                    } catch (err) {
                      pushToast('error', err instanceof Error ? err.message : 'Add failed');
                    }
                  })();
                }}
              >
                {isAddingDiscovered ? 'Adding…' : 'Add selected layer'}
              </button>
            </div>
          ) : null}

          <hr style={{ border: 0, borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0' }} />

          <label className="gis-dm-field">
            <span>OGC / XYZ / PMTiles / STAC URL</span>
            <input className="gis-dm-input" value={webUrl} onChange={e => setWebUrl(e.target.value)} placeholder="https://…/wfs?… or XYZ template" />
          </label>
          <label className="gis-dm-field">
            <span>Token (optional)</span>
            <input className="gis-dm-input" value={webToken} onChange={e => setWebToken(e.target.value)} />
          </label>
          <div className="gis-dm-actions-row">
            <button
              type="button"
              className="gis-dm-btn"
              onClick={() => {
                void (async () => {
                  const kind = suggestServiceKindFromUrl(webUrl);
                  try {
                    if (kind === 'wfs') {
                      const capsUrl = webUrl.includes('request=') ? webUrl : `${webUrl}${webUrl.includes('?') ? '&' : '?'}service=WFS&request=GetCapabilities`;
                      const res = await fetch(capsUrl);
                      const xml = await res.text();
                      const parsed = parseWfsGetCapabilities(xml);
                      setWfsLayers(parsed.layers);
                      if (parsed.layers[0]) setWfsTypeName(parsed.layers[0].name);
                      pushToast('ok', `WFS: ${parsed.layers.length} type(s)`);
                    } else if (kind === 'wms' || kind === 'wmts' || kind === 'xyz' || kind === 'pmtiles') {
                      await onImportOgcTile?.(kind === 'pmtiles' ? 'xyz' : kind, webUrl.trim(), layerName.trim() || undefined);
                      pushToast('ok', `${kind.toUpperCase()} overlay registered`);
                    } else {
                      await onImportRemoteUrl(webUrl.trim(), { layerName: layerName.trim() || undefined });
                      pushToast('ok', 'Service URL imported');
                    }
                    saveWebService({
                      id: uid('web'),
                      name: layerName.trim() || webUrl.trim(),
                      kind,
                      url: webUrl.trim(),
                      token: webToken.trim() || undefined,
                      savedAt: new Date().toISOString(),
                    });
                    setWebServices(listWebServices());
                  } catch (err) {
                    pushToast('error', err instanceof Error ? err.message : 'Service failed');
                  }
                })();
              }}
            >
              Detect & connect
            </button>
          </div>
          {wfsLayers.length ? (
            <div className="gis-dm-preview-panel">
              <label className="gis-dm-field">
                <span>WFS typeName</span>
                <select className="gis-dm-select" value={wfsTypeName} onChange={e => setWfsTypeName(e.target.value)}>
                  {wfsLayers.map(l => (
                    <option key={l.name} value={l.name}>
                      {l.title || l.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="gis-dm-btn gis-dm-btn--primary"
                onClick={() => {
                  void (async () => {
                    try {
                      if (onImportWfs) await onImportWfs(webUrl.trim(), wfsTypeName, webToken.trim() || undefined);
                      else {
                        const fc = await fetchWfsGeoJson(webUrl.trim(), wfsTypeName, webToken.trim() || undefined);
                        const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
                        const file = new File([blob], `${wfsTypeName || 'wfs'}.geojson`, { type: 'application/geo+json' });
                        await onImportFiles([file], { layerName: layerName.trim() || wfsTypeName });
                      }
                      pushToast('ok', `WFS layer ${wfsTypeName} imported`);
                    } catch (err) {
                      pushToast('error', err instanceof Error ? err.message : 'WFS GetFeature failed');
                    }
                  })();
                }}
              >
                Import WFS features
              </button>
            </div>
          ) : null}

          <div className="gis-dm-card-list" style={{ marginTop: 12 }}>
            {webServices.map(s => (
              <div key={s.id} className="gis-dm-card">
                <i className="fa-solid fa-link" aria-hidden />
                <div className="gis-dm-card-main">
                  <div className="gis-dm-card-title">{s.name}</div>
                  <div className="gis-dm-card-meta">
                    {s.kind} · {s.url}
                  </div>
                </div>
                <button
                  type="button"
                  className="gis-dm-btn gis-dm-btn--ghost"
                  onClick={() => {
                    deleteWebService(s.id);
                    setWebServices(listWebServices());
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </WorkspaceSection>
      );
    }

    if (category === 'lidar') {
      return (
        <WorkspaceSection
          title="LiDAR"
          lead="LAS / LAZ / COPC / EPT — client planning with gateway conversion for DSM/DTM."
        >
          <div
            className="gis-dm-dropzone"
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <div className="gis-dm-dropzone-icon" aria-hidden>
              <i className="fa-solid fa-mountain" />
            </div>
            <p className="gis-dm-dropzone-title">Drop LAS / LAZ / XYZ / PLY</p>
            <p className="gis-dm-dropzone-sub">Gateway converts to DSM, DTM, intensity, and hillshade</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept=".las,.laz,.xyz,.ply,.copc"
            onChange={e => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              e.target.value = '';
              void (async () => {
                const { planLidarIngest } = await import('../../../lib/gisIngest/bimLidar');
                for (const f of files) {
                  const plan = planLidarIngest(f.name);
                  pushToast('warn', `${f.name}: ${plan.message}`);
                }
              })();
            }}
          />
        </WorkspaceSection>
      );
    }
    if (category === 'realtime') {
      return <ComingSoon label="Real-Time" hint="Sensor and stream connectors for live GIS feeds." />;
    }
    if (category === 'ai') {
      return <ComingSoon label="AI Import" hint="Automatic schema detection and format recovery." />;
    }
    if (category === 'enterprise') {
      return <ComingSoon label="Enterprise" hint="Portal SSO, versioned geodatabases, and gateway catalogs." />;
    }
    return null;
  };

  const stepIndex = WIZARD_STEPS.findIndex(s => s.id === wizardStep);

  return createPortal(
    <>
      <div className="gis-dm-scrim" aria-hidden onMouseDown={onClose} />
      <div
        ref={shellRef}
        className={`gis-dm-shell gis-dm-shell--ltr${railCollapsed ? ' gis-dm-shell--rail-collapsed' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gis-dm-title"
        style={
          pos
            ? { top: pos.top, left: pos.left, width: size.w, height: size.h }
            : { visibility: 'hidden', width: size.w, height: size.h }
        }
        onMouseDown={e => e.stopPropagation()}
      >
        <header className="gis-dm-head">
          <div className="gis-dm-brand">
            <span className="gis-dm-brand-mark" aria-hidden>
              <i className="fa-solid fa-map" />
            </span>
            <div>
              <h2 className="gis-dm-title" id="gis-dm-title">
                GIS Data Manager
              </h2>
              <p className="gis-dm-subtitle">Enterprise import · connect · manage</p>
            </div>
          </div>
          <div className="gis-dm-head-actions">
            <button
              type="button"
              className="gis-dm-icon-btn"
              title={railCollapsed ? 'Expand categories' : 'Collapse categories'}
              onClick={() => setRailCollapsed(v => !v)}
            >
              <i className={`fa-solid fa-${railCollapsed ? 'angles-right' : 'angles-left'}`} aria-hidden />
            </button>
            <button type="button" className="gis-dm-icon-btn" title="Close" aria-label="Close" onClick={onClose}>
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        </header>

        <div className="gis-dm-search">
          <label className="gis-dm-search-field">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              type="search"
              placeholder="Search data sources…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search data sources"
            />
          </label>
        </div>

        <div className="gis-dm-body">
          <nav className="gis-dm-rail" aria-label="Data source categories">
            {filteredCategories.map(c => (
              <button
                key={c.id}
                type="button"
                className={`gis-dm-rail-btn${category === c.id ? ' is-active' : ''}${!c.ready ? ' is-disabled' : ''}`}
                onClick={() => {
                  setCategory(c.id);
                  setWizardStep('source');
                }}
                title={c.hint || c.label}
              >
                <span className="gis-dm-rail-icon" aria-hidden>
                  <i className={c.icon} />
                </span>
                <span className="gis-dm-rail-label">{c.label}</span>
                {!c.ready ? <span className="gis-dm-rail-hint">Soon</span> : null}
              </button>
            ))}
          </nav>
          <div className="gis-dm-main">
            <div className="gis-dm-workspace">{renderWorkspace()}</div>
            {(statusExternal || importBusy) && (
              <p className="gis-dm-lead" style={{ padding: '0 16px 8px' }}>
                {statusExternal}
              </p>
            )}
          </div>
        </div>

        <footer className="gis-dm-footer">
          <div className="gis-dm-wizard-steps" aria-label="Import wizard steps">
            {WIZARD_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`gis-dm-wizard-step${i === stepIndex ? ' is-current' : ''}${i < stepIndex ? ' is-done' : ''}`}
              >
                {i + 1}. {s.label}
              </span>
            ))}
          </div>
          <div className="gis-dm-footer-actions">
            <button type="button" className="gis-dm-btn gis-dm-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>

        <div className="gis-dm-toast-stack" aria-live="polite">
          {toasts.map(t => (
            <div key={t.id} className={`gis-dm-toast gis-dm-toast--${t.tone}`}>
              {t.message}
            </div>
          ))}
        </div>

        <div className="gis-dm-resize" onPointerDown={startResize} role="presentation" aria-hidden />
      </div>
    </>,
    document.body,
  );
}

export default GisDataManager;
