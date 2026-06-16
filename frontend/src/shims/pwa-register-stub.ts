/** Dev/no-PWA builds: satisfies `import('virtual:pwa-register')` without vite-plugin-pwa. */
export function registerSW(_options?: unknown) {
  return () => {}
}
