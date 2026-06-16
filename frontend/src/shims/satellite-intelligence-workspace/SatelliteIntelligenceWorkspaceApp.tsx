/**
 * In-repo fallback for `@satellite-intelligence-workspace/SatelliteIntelligenceWorkspaceApp`.
 * Keeps `npm run build` (and GitHub Pages CI) working without an external SIW checkout.
 * Override with env `SATELLITE_INTELLIGENCE_WORKSPACE` pointing at a real `src` folder if needed.
 */
export default function SatelliteIntelligenceWorkspaceApp() {
  return (
    <div style={{ padding: 'clamp(16px, 4vw, 32px)', maxWidth: 720, margin: '0 auto', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: 12 }}>Satellite Intelligence workspace</h1>
      <p style={{ marginBottom: 16, color: 'var(--muted-foreground, #64748b)' }}>
        This path is not bundled in the public GitHub build. Use the main Satellite Intelligence experience instead.
      </p>
      <a
        href="#/satellite/indices"
        style={{
          display: 'inline-block',
          fontWeight: 700,
          padding: '10px 16px',
          borderRadius: 10,
          background: 'var(--primary, #047857)',
          color: '#fff',
          textDecoration: 'none',
        }}
      >
        Open Satellite Intelligence
      </a>
    </div>
  )
}
