export function isMuiShellEnabled(): boolean {
  const raw = import.meta.env.VITE_MUI_SHELL
  return String(raw || '').trim().toLowerCase() === 'true'
}
