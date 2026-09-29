import { createContext, useContext, useMemo, type ReactNode } from 'react'

export type SiInstanceScope = 'standalone'

export function resolveSiScopedStorageKey(baseKey: string, _scope: SiInstanceScope = 'standalone'): string {
  return baseKey
}

export function resolveSiScopedSessionKey(baseKey: string, scope: SiInstanceScope = 'standalone'): string {
  return resolveSiScopedStorageKey(baseKey, scope)
}

type SiInstanceScopeContextValue = {
  scope: SiInstanceScope
  scopedStorageKey: (baseKey: string) => string
  scopedSessionKey: (baseKey: string) => string
  /** When true, skip URL deep-links and other cross-page side effects. */
  isolateRouting: boolean
  /** True when this SI tree must not share state with standalone `/satellite/indices`. */
  isIsolated: boolean
}

const standaloneDefaults: SiInstanceScopeContextValue = {
  scope: 'standalone',
  scopedStorageKey: (baseKey: string) => baseKey,
  scopedSessionKey: (baseKey: string) => baseKey,
  isolateRouting: false,
  isIsolated: false,
}

const SiInstanceScopeContext = createContext<SiInstanceScopeContextValue | null>(null)

export function SiInstanceScopeProvider({
  scope = 'standalone',
  children,
}: {
  scope?: SiInstanceScope
  children: ReactNode
}) {
  const value = useMemo<SiInstanceScopeContextValue>(
    () => ({
      scope,
      scopedStorageKey: (baseKey: string) => resolveSiScopedStorageKey(baseKey, scope),
      scopedSessionKey: (baseKey: string) => resolveSiScopedSessionKey(baseKey, scope),
      isolateRouting: false,
      isIsolated: false,
    }),
    [scope],
  )
  return <SiInstanceScopeContext.Provider value={value}>{children}</SiInstanceScopeContext.Provider>
}

export function useSiInstanceScope(): SiInstanceScopeContextValue {
  return useContext(SiInstanceScopeContext) ?? standaloneDefaults
}
