import React, { useId, useState } from 'react'
import type { NeighborhoodAgentEvidencePayload } from './neighborhoodAgentEvidence'
import './neighborhoodAgent.css'

export type NeighborhoodAgentEvidenceRowProps = {
  evidence: NeighborhoodAgentEvidencePayload
  /** Start collapsed (default true). */
  defaultCollapsed?: boolean
}

/**
 * Collapsible Thought / tools-used row with compact “Viewed” chips from pack evidence.
 */
export function NeighborhoodAgentEvidenceRow({
  evidence,
  defaultCollapsed = true,
}: NeighborhoodAgentEvidenceRowProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const panelId = useId()
  const okCount = evidence.tools.filter(t => t.ok).length
  const failCount = evidence.tools.length - okCount

  return (
    <div className="nac-evidence" data-pack={evidence.packId || undefined}>
      <button
        type="button"
        className="nac-evidence-toggle"
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={() => setCollapsed(v => !v)}
      >
        <i
          className={collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'}
          aria-hidden
        />
        <span className="nac-evidence-toggle-label">{evidence.thoughtTitle}</span>
        <span className="nac-evidence-toggle-meta">
          {okCount} used
          {failCount > 0 ? ` · ${failCount} failed` : ''}
        </span>
      </button>

      {!collapsed ? (
        <div id={panelId} className="nac-evidence-body" role="region" aria-label="Tools used">
          <div className="nac-evidence-viewed" aria-label="Viewed tools">
            <span className="nac-evidence-viewed-label">Viewed</span>
            <ul className="nac-evidence-chips">
              {evidence.tools.map((tool, i) => (
                <li key={`${tool.name}-${i}`}>
                  <span
                    className={[
                      'nac-evidence-chip',
                      tool.ok ? 'nac-evidence-chip--ok' : 'nac-evidence-chip--err',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={tool.preview}
                  >
                    <i
                      className={tool.ok ? 'fa-solid fa-check' : 'fa-solid fa-triangle-exclamation'}
                      aria-hidden
                    />
                    {tool.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <ul className="nac-evidence-details">
            {evidence.tools.map((tool, i) => (
              <li
                key={`d-${tool.name}-${i}`}
                className={[
                  'nac-evidence-detail',
                  tool.ok ? '' : 'nac-evidence-detail--err',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="nac-evidence-detail-name">{tool.label}</span>
                <span className="nac-evidence-detail-preview">{tool.preview || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="nac-evidence-viewed nac-evidence-viewed--compact" aria-label="Viewed tools">
          <span className="nac-evidence-viewed-label">Viewed</span>
          <ul className="nac-evidence-chips">
            {evidence.tools.map((tool, i) => (
              <li key={`c-${tool.name}-${i}`}>
                <span
                  className={[
                    'nac-evidence-chip',
                    tool.ok ? 'nac-evidence-chip--ok' : 'nac-evidence-chip--err',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={tool.preview}
                >
                  {tool.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
