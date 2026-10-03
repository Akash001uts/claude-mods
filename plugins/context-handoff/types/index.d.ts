// idle: watching. wrapping: the handoff prompt is out and Claude is writing the docs.
// ready: Claude called the tool; compaction starts when its turn ends. compacting: /compact is running.
export type Phase = 'idle' | 'wrapping' | 'ready' | 'compacting'
export type Pending = { instructions: string; kickoff: string; path: string }
export type Saved = { kickoff: string; path: string; savedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'context-handoff': {
      isAuto: boolean
      phase: Phase
      // Set once the threshold has fired, so a skipped or cancelled handoff doesn't fire every turn.
      hasFired: boolean
      pending: Pending | null
    }
  }
}
