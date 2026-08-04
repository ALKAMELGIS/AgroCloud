/** File System Access API helpers for batch export (one folder pick, many writes). */

const PICKER_ID = 'agrocloud-batch-export'

export const BATCH_EXPORT_FOLDER_REQUIRED =
  'Folder selection is required for batch export'
export const BATCH_EXPORT_CANCELLED = 'Batch export cancelled'
export const BATCH_EXPORT_PERMISSION_DENIED =
  'Write permission to the selected folder was denied'

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

function isAbortLike(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
    return true
  }
  return err instanceof Error && /abort|cancel/i.test(err.message)
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
    const next = await handle.requestPermission({ mode: 'readwrite' })
    if (next === 'granted') return
    throw new Error(BATCH_EXPORT_PERMISSION_DENIED)
  }
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
    dir = await showDirectoryPicker({ mode: 'readwrite', id: PICKER_ID })
  } catch (err) {
    if (isAbortLike(err, signal)) {
      throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
    }
    throw err
  }

  if (signal?.aborted) {
    throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
  }

  try {
    await ensureReadWritePermission(dir)
  } catch (err) {
    if (isAbortLike(err, signal)) {
      throw new DOMException(BATCH_EXPORT_CANCELLED, 'AbortError')
    }
    throw err
  }

  return dir
}

export async function writeBlobToDirectory(
  dir: FileSystemDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await dir.getFileHandle(filename, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
}
