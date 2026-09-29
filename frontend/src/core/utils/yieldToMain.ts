/** Yield the main thread so the UI can paint (export / heavy geometry). */
export function yieldToMain(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0)
  })
}
