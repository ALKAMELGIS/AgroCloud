import type { GisSelectionSetMode } from './types'
import { resolveSelectionSetModeFromClick } from './mapSelectionQuery'

export function resolveGisSelectionClickMode(
  toolbarMode: GisSelectionSetMode,
  clickEv?: MouseEvent | null,
): GisSelectionSetMode {
  return resolveSelectionSetModeFromClick(toolbarMode, clickEv)
}
