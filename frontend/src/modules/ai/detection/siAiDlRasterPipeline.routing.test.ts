import { describe, expect, it } from 'vitest';
import {
  isRasterDataFile,
  pickRasterUploadFiles,
  pickRasterZipCandidate,
} from './siAiDlRasterPipeline';

function fakeFile(name: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type: 'application/octet-stream' });
}

describe('raster vs vector routing', () => {
  it('does not treat shapefile zip as a raster data file', () => {
    expect(isRasterDataFile(fakeFile('parcels.zip'))).toBe(false);
    expect(isRasterDataFile(fakeFile('scene.tif'))).toBe(true);
    expect(isRasterDataFile(fakeFile('photo.jpg'))).toBe(true);
  });

  it('pickRasterUploadFiles ignores bare zip without an image', () => {
    expect(pickRasterUploadFiles([fakeFile('parcels.zip')])).toBeNull();
    const picked = pickRasterUploadFiles([fakeFile('a.tif'), fakeFile('a.tfw')]);
    expect(picked?.raster.name).toBe('a.tif');
    expect(picked?.companions.map(f => f.name)).toContain('a.tfw');
  });

  it('pickRasterZipCandidate finds zip for explicit raster-zip import', () => {
    expect(pickRasterZipCandidate([fakeFile('rasters.zip')])?.name).toBe('rasters.zip');
    expect(pickRasterZipCandidate([fakeFile('a.tif')])).toBeNull();
  });
});
