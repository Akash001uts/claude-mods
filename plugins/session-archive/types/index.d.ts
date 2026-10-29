// Token counts as the API reports them, summed.
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }

// One day of one session: messages you typed, and tokens per model.
export type Day = { messages: number; tokens: Record<string, Tokens> }

// One archived session, as the index keeps it.
export type Entry = {
  id: string
  machine: string
  project: string
  root: string
  title: string
  summary: string
  keywords: string[]
  started: number
  ended: number
  messages: number
  // Keyed by local date, YYYY-MM-DD.
  days: Record<string, Day>
  // Messages typed per hour of the day, 0 to 23.
  hours: number[]
  // The archive copy's path without its extension; '' when sessions stay where Claude Code keeps them.
  file: string
  // The transcript Claude Code wrote.
  source: string
  // Bytes of the source when last copied, so backfill skips what hasn't changed.
  size: number
  // Messages when the title was written, so the end of a long session can retitle it.
  titledAt: number
}

export type Settings = {
  // null: leave the transcripts where Claude Code keeps them, and only index them.
  folder: string | null
  format: 'raw' | 'md' | 'both'
  mode: 'meaning' | 'plain'
}

declare module 'claude-code' {
  interface PluginState {
    'session-archive': {
      // The stats pane's filters.
      range: 'all' | '30' | '7'
      isHere: boolean
    }
  }
}
