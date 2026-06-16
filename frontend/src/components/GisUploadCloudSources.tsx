import { useCallback, useState } from 'react';
import { GIS_NEW_ITEM_SOURCES } from '../pages/master/gisContentPortalData';
import { pickCloudUploadFile } from '../lib/cloudFilePicker';
import type { CloudUploadSourceId } from '../lib/cloudFilePickerConfig';

export type GisUploadCloudSourcesProps = {
  /** Highlight active source chip. */
  activeSource?: CloudUploadSourceId;
  onActiveSourceChange?: (id: CloudUploadSourceId) => void;
  /** Called when a cloud file is ready (same as local file pick). */
  onFile: (file: File) => void;
  /** Status / error line for parent modal. */
  onStatus?: (message: string) => void;
  /** Include “Your device” (local file input trigger). Default false when dropzone handles device. */
  includeDevice?: boolean;
  onDeviceClick?: () => void;
  className?: string;
  /** 3 cloud buttons only vs full 4-button row. */
  cloudOnly?: boolean;
};

export function GisUploadCloudSources({
  activeSource,
  onActiveSourceChange,
  onFile,
  onStatus,
  includeDevice = false,
  onDeviceClick,
  className = '',
  cloudOnly = false,
}: GisUploadCloudSourcesProps) {
  const [busySource, setBusySource] = useState<CloudUploadSourceId | null>(null);

  const sources = cloudOnly
    ? GIS_NEW_ITEM_SOURCES.filter(s => s.id !== 'device')
    : GIS_NEW_ITEM_SOURCES;

  const handlePick = useCallback(
    async (id: (typeof GIS_NEW_ITEM_SOURCES)[number]['id']) => {
      onActiveSourceChange?.(id);
      if (id === 'device') {
        onDeviceClick?.();
        return;
      }
      setBusySource(id);
      onStatus?.('');
      await pickCloudUploadFile(id, {
        onFile: file => {
          onFile(file);
          onStatus?.(`Ready: ${file.name}. Review and import to map.`);
          setBusySource(null);
        },
        onError: message => {
          onStatus?.(message);
          setBusySource(null);
        },
        onBusy: busy => {
          if (!busy) setBusySource(null);
        },
      });
    },
    [onActiveSourceChange, onDeviceClick, onFile, onStatus],
  );

  return (
    <div className={`gis-upload-cloud-sources${className ? ` ${className}` : ''}`} role="group" aria-label="Upload from cloud">
      {sources.map(src => {
        const active = (activeSource ?? 'device') === src.id;
        const busy = busySource === src.id;
        return (
          <button
            key={src.id}
            type="button"
            className={`gis-upload-cloud-sources__btn${active ? ' active' : ''}${busy ? ' busy' : ''}`}
            disabled={Boolean(busySource && busySource !== src.id)}
            onClick={() => void handlePick(src.id)}
          >
            <i className={busy ? 'fa-solid fa-spinner fa-spin' : src.icon} aria-hidden />
            <span>{src.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Re-export type for consumers
export type { CloudUploadSourceId };
