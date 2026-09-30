import JSZip from 'jszip';

const SHAPEFILE_PART_EXTS = new Set(['shp', 'dbf', 'shx', 'prj', 'cpg', 'sbn', 'sbx']);

/** True when the file name looks like a shapefile sidecar (or the .shp itself). */
export function isShapefilePart(name: string): boolean {
  const base = name.replace(/^.*[/\\]/, '');
  const ext = base.split('.').pop()?.toLowerCase();
  return !!ext && SHAPEFILE_PART_EXTS.has(ext);
}

function stripExt(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, '');
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(0, i) : base;
}

/**
 * Pack a set of shapefile parts into a single `{basename}.zip` for shpjs.
 * Finds the first `.shp`, then includes every matching part that shares its basename.
 */
export async function zipShapefileParts(files: File[]): Promise<File> {
  const parts = files.filter(f => isShapefilePart(f.name));
  const shp = parts.find(f => f.name.toLowerCase().endsWith('.shp'));
  if (!shp) {
    throw new Error('No .shp file found among the selected shapefile parts.');
  }

  const basename = stripExt(shp.name);
  const lowerBase = basename.toLowerCase();
  const matching = parts.filter(f => stripExt(f.name).toLowerCase() === lowerBase);
  if (!matching.some(f => f.name.toLowerCase().endsWith('.dbf'))) {
    throw new Error(`Shapefile "${basename}" is missing a matching .dbf attribute table.`);
  }

  const zip = new JSZip();
  for (const f of matching) {
    const entryName = f.name.replace(/^.*[/\\]/, '');
    zip.file(entryName, await f.arrayBuffer());
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return new File([blob], `${basename}.zip`, { type: 'application/zip' });
}
