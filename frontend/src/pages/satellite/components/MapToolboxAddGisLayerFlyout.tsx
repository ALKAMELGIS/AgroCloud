import { useEffect, useRef } from 'react';

export type MapToolboxAddGisLayerAction = 'browse' | 'url' | 'file' | 'sketch' | 'media';

const MENU_ITEMS: Array<{
  id: MapToolboxAddGisLayerAction;
  label: string;
  icon: string;
}> = [
  { id: 'browse', label: 'Browse layers', icon: 'fa-solid fa-magnifying-glass' },
  { id: 'url', label: 'Add layer from URL', icon: 'fa-solid fa-globe' },
  { id: 'file', label: 'Add layer from file', icon: 'fa-solid fa-file' },
  { id: 'sketch', label: 'Create sketch layer', icon: 'fa-solid fa-pencil' },
  { id: 'media', label: 'Add media layer', icon: 'fa-solid fa-image' },
];

export type MapToolboxAddGisLayerFlyoutProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (action: MapToolboxAddGisLayerAction) => void;
  /** Anchor element id for aria */
  anchorId?: string;
};

export function MapToolboxAddGisLayerFlyout({
  open,
  onClose,
  onSelect,
  anchorId = 'map-toolbox-add-gis-layer-btn',
}: MapToolboxAddGisLayerFlyoutProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      const anchor = document.getElementById(anchorId);
      if (anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorId]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="si-map-toolbox-add-gis-flyout"
      role="menu"
      aria-label="Add GIS layer sources"
    >
      {MENU_ITEMS.map(item => (
        <button
          key={item.id}
          type="button"
          className="si-map-toolbox-add-gis-flyout__item"
          role="menuitem"
          onClick={() => {
            onSelect(item.id);
            onClose();
          }}
        >
          <i className={item.icon} aria-hidden />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
