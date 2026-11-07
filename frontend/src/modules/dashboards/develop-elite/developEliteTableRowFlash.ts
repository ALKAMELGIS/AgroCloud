export const DEVELOP_ELITE_TABLE_ROW_FLASH_MS = 1600

/** Clears flash state then re-applies on the next frame so CSS animation restarts. */
export function scheduleDevelopEliteTableRowFlashRestart(
  apply: (rowId: string | null, fieldKey: string | null) => void,
  target: { rowId?: string | null; fieldKey?: string | null },
): void {
  apply(null, null)
  requestAnimationFrame(() => {
    apply(target.rowId ?? null, target.fieldKey ?? null)
  })
}
