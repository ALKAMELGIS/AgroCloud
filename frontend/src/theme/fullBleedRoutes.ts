/** Map / dashboard routes that should use the full viewport (no MUI shell gutters or bottom nav). */
export function isFullBleedMainClass(mainClassName?: string): boolean {
  if (!mainClassName) return false
  return (
    mainClassName.includes('content--satellite-intelligence') ||
    mainClassName.includes('content--gis-content-portal') ||
    mainClassName.includes('content--weather-intelligence')
  )
}
