/**
 * `fetchpriority` hint for <img>/<link>/<script>.
 *
 * React 18 does not know the camelCase `fetchPriority` prop (added in React 19): it logs
 * "React does not recognize the `fetchPriority` prop" and drops it. The lowercase HTML attribute
 * is passed through as-is, so spread this instead: `<img {...fetchPriorityAttr('high')} />`.
 * After upgrading to React 19, replace with the native `fetchPriority` prop.
 */
export function fetchPriorityAttr(priority: 'high' | 'low' | 'auto'): Record<'fetchpriority', string> {
  return { fetchpriority: priority }
}
