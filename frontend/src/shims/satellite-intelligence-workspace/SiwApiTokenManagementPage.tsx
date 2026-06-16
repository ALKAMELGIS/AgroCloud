/**
 * In-repo fallback for `@satellite-intelligence-workspace/SiwApiTokenManagementPage`.
 * See `SatelliteIntelligenceWorkspaceApp.tsx` for context.
 */
export default function SiwApiTokenManagementPage() {
  return (
    <div style={{ padding: 'clamp(16px, 4vw, 32px)', maxWidth: 720, margin: '0 auto', lineHeight: 1.5 }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: 12 }}>API token management</h1>
      <p style={{ marginBottom: 16, color: 'var(--muted-foreground, #64748b)' }}>
        This page is not included in the public GitHub build. Configure tokens from your local SIW workspace when available.
      </p>
      <a href="#/" style={{ fontWeight: 700, color: 'var(--primary, #047857)' }}>
        Back to home
      </a>
    </div>
  )
}
