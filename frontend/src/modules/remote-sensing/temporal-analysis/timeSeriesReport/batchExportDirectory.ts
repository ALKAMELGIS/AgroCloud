/** File System Access API helpers for batch export (one folder pick, many writes). */

const PICKER_ID = 'agrocloud-batch-export'
const BATCH_EXPORT_IDB_NAME = 'agrocloud_batch_export_v1'
const BATCH_EXPORT_IDB_STORE = 'handles'
const BATCH_EXPORT_IDB_KEY = 'directory'

export const BATCH_EXPORT_FOLDER_REQUIRED =
  'Select a folder once to save all batch Excel reports. Folder selection is required for Batch Analytics export.'
export const BATCH_EXPORT_CANCELLED = 'Batch export cancelled'
export const BATCH_EXPORT_PERMISSION_DENIED =
  'Write permission to the selected folder was denied'
export const BATCH_EXPORT_PICKER_BLOCKED =
  'Folder picker blocked — click Batch Export again and choose a folder immediately.'
export const BATCH_EXPORT_PICKER_BUSY = 'Folder picker already open'

type DirectoryPickerWindow = Window &
  typeof globalThis & {
    showDirectoryPicker?: (options?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?: FileSystemHandle | WellKnownDirectory
    }) => Promise<FileSystemDirectoryHandle>
  }

type WellKnownDirectory =
  | 'desktop'
  | 'documents'
  | 'downloads'
  | 'music'
  | 'pictures'
  | 'videos'

function asDirectoryPickerWindow(): DirectoryPickerWindow {
  return window as DirectoryPickerWindow
}

export function isBatchDirectoryPickerSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof asDirectoryPickerWindow().showDirectoryPicker === 'function'
}

function isUserCancelError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') {
    const msg = err.message.trim()
    return (
      msg === BATCH_EXPORT_CANCELLED ||
      /user aborted|aborted by the user|the user cancelled|user cancelled/i.test(msg)
    )
  }
  return err instanceof Error && err.message === BATCH_EXPORT_CANCELLED
}

export function isBatchExportCancelled(err: unknown): boolean {
  return isUserCancelError(err)
}

export type BatchFolderPickResult =
  | { status: 'folder'; directory: FileSystemDirectoryHandle }
  | { status: 'cancelled' }
  | { status: 'blocked'; message: string }
  | { status: 'permission_denied'; message: string }
  | { status: 'unsupported' }

/**
 * Pick a writable folder from a user gesture. Returns a structured result instead of
 * throwing for cancel/blocked so the UI can choose folder writes vs download fallback.
 */
export async function pickBatchExportDirectoryFromGesture(
  signal?: AbortSignal,
): Promise<BatchFolderPickResult> {
  if (!isBatchDirectoryPickerSupported()) {
    return { status: 'unsupported' }
  }
  try {
    const directory = await pickBatchExportDirectory(signal)
    return { status: 'folder', directory }
  } catch (err) {
    if (isBatchExportCancelled(err)) {
      return { status: 'cancelled' }
    }
    if (err instanceof Error && err.message === BATCH_EXPORT_PICKER_BLOCKED) {
      return { status: 'blocked', message: err.message }
    }
    if (err instanceof Error && err.message === BATCH_EXPORT_PERMISSION_DENIED) {
      return { status: 'permission_denied', message: err.message }
    }
    const message = err instanceof Error ? err.message : 'Folder picker failed'
    return { status: 'blocked', message }
  }
}

function isAbortLike(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return isUserCancelError(err)
}

async function ensureReadWritePermission(dir: FileSystemDirectoryHandle): Promise<void> {
  const handle = dir as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
  }

  if (typeof handle.queryPermission === 'function') {
    const current = await handle.queryPermission({ mode: 'readwrite' })
    if (current === 'granted') return
  }
  if (typeof handle.requestPermission === 'function') {
    try {
      const next = await handle.requestPermission({ mode: 'readwrite' })
      if (next === 'granted') return
      throw new Error(BATCH_EXPORT_PERMISSION_DENIED)
    } catch (err) {
      if (err instanceof Error && err.message === BATCH_EXPORT_PERMISSION_DENIED) throw err
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(BATCH_EXPORT_PERMISSION_DENIED)
      }
      throw err
    }
  }
}

export async function ensureBatchDirectoryWritePermission(
  dir: FileSystemDirectoryHandle,
): Promise<void> {
  await ensureReadWritePermission(dir)
}

type WritableFileHandle = FileSystemFileHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
}

/** Re-request write permission before a delayed save (handles long batch exports). */
export async function ensureFileHandleWritePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  const file = handle as WritableFileHandle
  if (typeof file.queryPermission === 'function') {
    const current = await file.queryPermission({ mode: 'readwrite' })
    if (current === 'granted') return true
  }
  if (typeof file.requestPermission === 'function') {
    const next = await file.requestPermission({ mode: 'readwrite' })
    return next === 'granted'
  }
  return true
}

/**
 * Start the folder picker synchronously from a click handler (must be called directly
 * inside onClick, before any await, so the browser keeps the user-gesture context).
 */
let batchDirectoryPickInFlight = false
let rememberedBatchExportDirectory: FileSystemDirectoryHandle | null = null

function openBatchExportDirectoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const req = indexedDB.open(BATCH_EXPORT_IDB_NAME, 1)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(BATCH_EXPORT_IDB_STORE)) {
        db.createObjectStore(BATCH_EXPORT_IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

/** Persist the picked folder across page reloads (same origin). */
export async function persistBatchExportDirectoryToStorage(
  dir: FileSystemDirectoryHandle,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openBatchExportDirectoryDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(BATCH_EXPORT_IDB_STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB write failed'))
      tx.objectStore(BATCH_EXPORT_IDB_STORE).put(dir, BATCH_EXPORT_IDB_KEY)
    })
    db.close()
  } catch {
    /* non-fatal — in-memory handle still works for this session */
  }
}

/** Load a previously picked folder and confirm write access when possible. */
export async function loadPersistedBatchExportDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openBatchExportDirectoryDb()
    const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
      const tx = db.transaction(BATCH_EXPORT_IDB_STORE, 'readonly')
      const req = tx.objectStore(BATCH_EXPORT_IDB_STORE).get(BATCH_EXPORT_IDB_KEY)
      req.onerror = () => reject(req.error ?? new Error('indexedDB read failed'))
      req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined)
    })
    db.close()
    if (!handle) return null
    await ensureBatchDirectoryWritePermission(handle)
    return handle
  } catch {
    return null
  }
}

export function rememberBatchExportDirectory(dir: FileSystemDirectoryHandle): void {
  rememberedBatchExportDirectory = dir
  void persistBatchExportDirectoryToStorage(dir)
}

export function getRememberedBatchExportDirectory(): FileSystemDirectoryHandle | null {
  return rememberedBatchExportDirectory
}

export async function canWriteToRememberedBatchDirectory(): Promise<boolean> {
  if (!rememberedBatchExportDirectory) return false
  try {
    await ensureBatchDirectoryWritePermission(rememberedBatchExportDirectory)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve a writable export folder without opening a new picker (persisted handle or session memory).
 */
export async function resolveWritableBatchExportDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (rememberedBatchExportDirectory) {
    try {
      await ensureBatchDirectoryWritePermission(rememberedBatchExportDirectory)
      return rememberedBatchExportDirectory
    } catch {
      rememberedBatchExportDirectory = null
    }
  }
  const persisted = await loadPersistedBatchExportDirectory()
  if (persisted) {
    rememberedBatchExportDirectory = persisted
    return persisted
  }
  return null
}

export function batchExportDirectoryLabel(dir: FileSystemDirectoryHandle): string {
  const name = String(dir.name || '').trim()
  return name || 'Selected folder'
}

export function beginBatchExportDirectoryPick(
  signal?: AbortSignal,
): Promise<FileSystemDirectoryHandle> {
  if (batchDirectoryPickInFlight) {
    return Promise.reject(new Error(BATCH_EXPORT_PICKER_BUSY))
  }
  batchDirectoryPickInFlight = true
  return pickBatchExportDirectory(signal).finally(() => {
    batchDirectoryPickInFlight = false
  })
}

/**
 * Start {@link showDirectoryPicker} synchronously from a click handler (must not be wrapped in
 * async/await before the call — Chromium requires an active user gesture).
 */
export function beginBatchExportDirectoryPickFromGesture(): Promise<FileSystemDirectoryHandle | null> {
  if (batchDirectoryPickInFlight) {
    return Promise.reject(new Error(BATCH_EXPORT_PICKER_BUSY))
  }
  if (!isBatchDirectoryPickerSupported()) {
    return Promise.resolve(null)
  }

  batchDirectoryPickInFlight = true
  const showDirectoryPicker = asDirectoryPickerWindow().showDirectoryPicker!

  return showDirectoryPicker({
    mode: 'readwrite',
    id: PICKER_ID,
    startIn: 'desktop',
  })
    .then(dir => {
      rememberBatchExportDirectory(dir)
      return dir
    })
    .catch((err: unknown) => {
      if (isBatchExportCancelled(err)) return null
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        throw new Error(BATCH_EXPORT_PICKER_BLOCKED)
      }
      throw err
    })
    .finally(() => {
      batchDirectoryPickInFlight = false
    })
}

/**
 * Prompt once for a writable export folder (must run from a user gesture on Chromium).
 */
export async function pickBatchExportDirectory(
  signal?: AbortSignal,
): Promise<FileSystemDirectoryHandle> {
  if (signal?.aborted) {
    throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
  }
  if (!isBatchDirectoryPickerSupported()) {
    throw new Error(BATCH_EXPORT_FOLDER_REQUIRED)
  }

  const showDirectoryPicker = asDirectoryPickerWindow().showDirectoryPicker!
  let dir: FileSystemDirectoryHandle
  try {
    dir = await showDirectoryPicker({
      mode: 'readwrite',
      id: PICKER_ID,
      startIn: 'desktop',
    })
  } catch (err) {
    if (isAbortLike(err, signal)) {
      throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
    }
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      throw new Error(BATCH_EXPORT_PICKER_BLOCKED)
    }
    throw err
  }

  if (signal?.aborted) {
    throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
  }

  // readwrite pick grants access — avoid a second permission prompt users often dismiss.
  rememberBatchExportDirectory(dir)
  return dir
}

export async function writeBlobToDirectory(
  dir: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) {
        await ensureBatchDirectoryWritePermission(dir)
        await new Promise(resolve => window.setTimeout(resolve, 120 * attempt))
      } else {
        await ensureBatchDirectoryWritePermission(dir)
      }
      const fileHandle = await dir.getFileHandle(filename, { create: true })
      await writeBlobToFileHandle(fileHandle, blob)
      return
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

/** Temporary probe basename — removed immediately after the write check. */
const BATCH_EXPORT_MARKER = '_agrocloud_write_test.txt'

async function removeDirectoryEntryIfPresent(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  try {
    await dir.removeEntry(name)
  } catch {
    /* missing or locked — ignore */
  }
}

/** Remove legacy write-test files from earlier app versions. */
export async function cleanupBatchExportWriteTestMarkers(
  dir: FileSystemDirectoryHandle,
): Promise<void> {
  await removeDirectoryEntryIfPresent(dir, BATCH_EXPORT_MARKER)
  await removeDirectoryEntryIfPresent(dir, '_agrocloud_write_test')
}

/**
 * Confirm the picked folder is writable immediately after the user gesture (before a long batch run).
 * Writes a tiny probe file, then deletes it so nothing is left in the user's folder.
 */
export async function verifyBatchExportDirectoryWritable(
  dir: FileSystemDirectoryHandle,
): Promise<void> {
  await ensureBatchDirectoryWritePermission(dir)
  await cleanupBatchExportWriteTestMarkers(dir)
  const blob = new Blob(['AgroCloud batch export\n'], { type: 'text/plain' })
  await writeBlobToDirectory(dir, BATCH_EXPORT_MARKER, blob)
  await cleanupBatchExportWriteTestMarkers(dir)
}

export type DirectoryBlobDelivery = {
  filename: string
  savedToFolder: boolean
  usedDownloadFallback: boolean
}

export type DirectoryBlobDeliveryOptions = {
  /**
   * When true, never open a Save As / folder picker on failure.
   * When {@link allowDownloadFallback} is true, failed folder writes trigger a silent download.
   */
  folderOnly?: boolean
  /** When false, return usedDownloadFallback: false without downloading (batch export collects failures). */
  allowDownloadFallback?: boolean
}

/** Create a dated subfolder inside the user-picked directory (reduces OneDrive/sync conflicts). */
export async function ensureBatchExportOutputDirectory(
  parent: FileSystemDirectoryHandle,
  dateLabel?: string,
): Promise<FileSystemDirectoryHandle> {
  await ensureBatchDirectoryWritePermission(parent)
  const stamp = (dateLabel?.trim().slice(0, 10) || new Date().toISOString().slice(0, 10)).replace(
    /[^\d-]/g,
    '',
  )
  const folderName = `AgroCloud_Analytics_${stamp || 'export'}`
  return parent.getDirectoryHandle(folderName, { create: true })
}

export function formatBatchOutputFolderLabel(
  parent: FileSystemDirectoryHandle,
  output: FileSystemDirectoryHandle,
): string {
  if (output.name === parent.name) return parent.name
  return `${parent.name}/${output.name}`
}

/**
 * Write one workbook into a pre-picked folder, re-checking permission before each save.
 * On failure, falls back to a silent browser download (no Save As dialog).
 */
export async function deliverBlobToDirectory(
  dir: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
  options?: DirectoryBlobDeliveryOptions,
): Promise<DirectoryBlobDelivery> {
  const safeName = filename.trim().endsWith('.xlsx')
    ? filename.trim()
    : `${filename.trim() || 'Report'}.xlsx`
  const allowDownloadFallback = options?.allowDownloadFallback !== false

  const attemptFolderWrite = async (): Promise<void> => {
    await writeBlobToDirectory(dir, safeName, blob)
  }

  try {
    await attemptFolderWrite()
    return { filename: safeName, savedToFolder: true, usedDownloadFallback: false }
  } catch (firstErr) {
    try {
      await ensureBatchDirectoryWritePermission(dir)
      await attemptFolderWrite()
      return { filename: safeName, savedToFolder: true, usedDownloadFallback: false }
    } catch (secondErr) {
      if (allowDownloadFallback) {
        triggerBrowserBlobDownload(blob, safeName)
        return { filename: safeName, savedToFolder: false, usedDownloadFallback: true }
      }
      return { filename: safeName, savedToFolder: false, usedDownloadFallback: false }
    }
  }
}

export async function writeBlobToFileHandle(
  handle: FileSystemFileHandle,
  blob: Blob,
): Promise<void> {
  const permitted = await ensureFileHandleWritePermission(handle)
  if (!permitted) throw new Error(BATCH_EXPORT_PERMISSION_DENIED)

  let writable: FileSystemWritableFileStream | null = null
  try {
    writable = await handle.createWritable({ keepExistingData: false })
    await writable.write(blob)
    await writable.close()
    writable = null
  } finally {
    if (writable) {
      try {
        await writable.close()
      } catch {
        /* close may fail if createWritable/write already failed */
      }
    }
  }
}

const FIELD_SUMMARY_SAVE_PICKER_ID = 'agrocloud-field-summary-export'

export function isSaveFilePickerSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.showSaveFilePicker === 'function'
}

/** Save dialog or folder picker — must start synchronously from a click handler. */
export function isFieldSummarySavePickerSupported(): boolean {
  return isSaveFilePickerSupported() || isBatchDirectoryPickerSupported()
}

export type FieldSummarySaveTarget =
  | { kind: 'file'; handle: FileSystemFileHandle; filename: string }
  | { kind: 'folder'; directory: FileSystemDirectoryHandle; filename: string }

export type BlobSaveDelivery = {
  filename: string
  deliveryMode: 'file' | 'folder' | 'download'
  locationLabel?: string
  /** True when File System Access write failed and browser download was used instead. */
  usedDownloadFallback?: boolean
}

export function triggerBrowserBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadBatchExportZipArchive(
  entries: { filename: string; blob: Blob }[],
  archiveName: string,
): Promise<void> {
  if (!entries.length) return
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const entry of entries) {
    zip.file(entry.filename, entry.blob)
  }
  const safeName = archiveName.trim().endsWith('.zip')
    ? archiveName.trim()
    : `${archiveName.trim() || 'AgroCloud_Export'}.zip`
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  triggerBrowserBlobDownload(blob, safeName)
}

/**
 * Write blob to a pre-picked folder/file.
 * When saveTarget is set (user already chose a location), never opens a second Save As dialog.
 */
export async function deliverBlobToSaveTarget(
  blob: Blob,
  filename: string,
  saveTarget?: FieldSummarySaveTarget,
): Promise<BlobSaveDelivery> {
  const safeName = filename.trim().endsWith('.xlsx') ? filename.trim() : `${filename.trim() || 'Field_Report'}.xlsx`

  if (!saveTarget) {
    triggerBrowserBlobDownload(blob, safeName)
    return { filename: safeName, deliveryMode: 'download', locationLabel: safeName }
  }

  if (saveTarget.kind === 'file') {
    try {
      await writeBlobToFileHandle(saveTarget.handle, blob)
      return {
        filename: saveTarget.filename || safeName,
        deliveryMode: 'file',
        locationLabel: saveTarget.filename || safeName,
      }
    } catch (firstErr) {
      const permitted = await ensureFileHandleWritePermission(saveTarget.handle)
      if (!permitted) {
        throw new Error(
          `Could not save "${saveTarget.filename || safeName}". Close the file in Excel if it is open, then try again.`,
        )
      }
      try {
        await writeBlobToFileHandle(saveTarget.handle, blob)
        return {
          filename: saveTarget.filename || safeName,
          deliveryMode: 'file',
          locationLabel: saveTarget.filename || safeName,
        }
      } catch (secondErr) {
        throw new Error(
          `Could not save "${saveTarget.filename || safeName}". Close the file in Excel if it is open, then try again.${
            secondErr instanceof Error && secondErr.message ? ` (${secondErr.message})` : ''
          }`,
        )
      }
    }
  }

  const outName = saveTarget.filename || safeName
  const folderResult = await deliverBlobToDirectory(saveTarget.directory, outName, blob, {
    folderOnly: true,
  })
  return {
    filename: folderResult.filename,
    deliveryMode: folderResult.usedDownloadFallback ? 'download' : 'folder',
    locationLabel: folderResult.usedDownloadFallback
      ? folderResult.filename
      : `${saveTarget.directory.name}/${folderResult.filename}`,
    usedDownloadFallback: folderResult.usedDownloadFallback || undefined,
  }
}

/**
 * Pick where the single Field Summary workbook should be written.
 * Call directly from onClick (before any await) so the browser keeps user-gesture context.
 */
export function beginBatchFieldSummarySavePick(
  suggestedFilename: string,
  signal?: AbortSignal,
): Promise<FieldSummarySaveTarget> {
  return pickBatchFieldSummarySaveTarget(suggestedFilename, signal)
}

export async function pickBatchFieldSummarySaveTarget(
  suggestedFilename: string,
  signal?: AbortSignal,
): Promise<FieldSummarySaveTarget> {
  const filename = suggestedFilename.trim().endsWith('.xlsx')
    ? suggestedFilename.trim()
    : `${suggestedFilename.trim() || 'Field_Report'}.xlsx`

  if (signal?.aborted) {
    throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
  }

  // Folder pick survives long batch runs better than a file handle from Save As.
  if (isBatchDirectoryPickerSupported()) {
    const directory = await pickBatchExportDirectory(signal)
    return { kind: 'folder', directory, filename }
  }

  if (isSaveFilePickerSupported()) {
    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: filename,
        id: FIELD_SUMMARY_SAVE_PICKER_ID,
        types: [
          {
            description: 'Excel workbook',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            },
          },
        ],
      })
      return { kind: 'file', handle, filename: handle.name || filename }
    } catch (err) {
      if (isAbortLike(err, signal)) {
        throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
      }
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        throw new Error(BATCH_EXPORT_PICKER_BLOCKED)
      }
      throw err
    }
  }

  throw new Error('Save location picker is not supported in this browser')
}
