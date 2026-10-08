export type Pin = { text: string; pinnedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'session-pins': {
      pins: Pin[]
      // Hides the band only; Claude still sees the pins.
      isHidden: boolean
      // The pin opened out to full length (its text, which no other pin shares), or null.
      expanded: string | null
    }
  }
}
