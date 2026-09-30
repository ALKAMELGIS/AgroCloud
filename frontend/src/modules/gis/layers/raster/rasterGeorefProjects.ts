/**
 * Client-side project store for the Raster & Georeferencing tool.
 *
 * Projects live in the browser (localStorage); the actual raster pixels stay on the server
 * (referenced by `rasterId`). A project just records which rasters belong to it plus their
 * placement (for re-baking / provenance) and per-raster display settings. Opening a project
 * re-fetches each raster from `/api/raster/:id` and re-adds its layer.
 */
import type { RasterGeoreferencePayload } from './siRasterTileService'

const STORAGE_KEY = 'agrocloud.rasterGeorefProjects.v1'

/** Per-raster display settings (mapped to native Mapbox raster paint properties). */
export type RasterDisplaySettings = {
  /** 0..1 -> raster-opacity */
  opacity: number
  /** 0..1 -> raster-brightness-max */
  brightness: number
  /** -1..1 -> raster-contrast */
  contrast: number
  /** -1..1 -> raster-saturation */
  saturation: number
  /** 0..359 degrees -> raster-hue-rotate */
  hue: number
}

export const DEFAULT_DISPLAY: RasterDisplaySettings = {
  opacity: 1,
  brightness: 1,
  contrast: 0,
  saturation: 0,
  hue: 0,
}

/** A raster belonging to a project. */
export type RasterProjectItem = {
  rasterId: string
  name: string
  /** The placement used to georeference the raster (null when it was already georeferenced). */
  placement?: RasterGeoreferencePayload | null
  display: RasterDisplaySettings
}

/** A georeferencing project. */
export type RasterGeorefProject = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  rasters: RasterProjectItem[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return `rgp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readAll(): RasterGeorefProject[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is RasterGeorefProject => !!p && typeof p.id === 'string')
  } catch {
    return []
  }
}

function writeAll(projects: RasterGeorefProject[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  } catch {
    /* quota / serialization failure — projects are best-effort persisted */
  }
}

/** List all projects, most-recently-updated first. */
export function listProjects(): RasterGeorefProject[] {
  return readAll().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
}

/** Get a single project by id, or null. */
export function getProject(id: string): RasterGeorefProject | null {
  return readAll().find(p => p.id === id) || null
}

/** Create and persist a new empty project. */
export function createProject(name: string): RasterGeorefProject {
  const trimmed = (name || '').trim() || 'Untitled project'
  const project: RasterGeorefProject = {
    id: newId(),
    name: trimmed,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rasters: [],
  }
  const all = readAll()
  all.push(project)
  writeAll(all)
  return project
}

/** Insert or update a project (upsert by id), stamping `updatedAt`. */
export function saveProject(project: RasterGeorefProject): RasterGeorefProject {
  const stamped: RasterGeorefProject = { ...project, updatedAt: nowIso() }
  const all = readAll()
  const idx = all.findIndex(p => p.id === stamped.id)
  if (idx >= 0) all[idx] = stamped
  else all.push(stamped)
  writeAll(all)
  return stamped
}

/** Rename a project; returns the updated project or null if not found. */
export function renameProject(id: string, name: string): RasterGeorefProject | null {
  const all = readAll()
  const idx = all.findIndex(p => p.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], name: (name || '').trim() || all[idx].name, updatedAt: nowIso() }
  writeAll(all)
  return all[idx]
}

/** Delete a project; returns true if it existed. */
export function deleteProject(id: string): boolean {
  const all = readAll()
  const next = all.filter(p => p.id !== id)
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

/** Add or replace a raster item within a project (matched by rasterId). */
export function upsertProjectRaster(
  project: RasterGeorefProject,
  item: RasterProjectItem,
): RasterGeorefProject {
  const rasters = project.rasters.slice()
  const idx = rasters.findIndex(r => r.rasterId === item.rasterId)
  if (idx >= 0) rasters[idx] = item
  else rasters.push(item)
  return { ...project, rasters, updatedAt: nowIso() }
}

/** Remove a raster item from a project (matched by rasterId). */
export function removeProjectRaster(
  project: RasterGeorefProject,
  rasterId: string,
): RasterGeorefProject {
  return {
    ...project,
    rasters: project.rasters.filter(r => r.rasterId !== rasterId),
    updatedAt: nowIso(),
  }
}
