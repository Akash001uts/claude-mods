export type Segment = { name: string; color: string; tokens: number; kind: 'used' | 'free' | 'buffer' }
export type Limit = { kind: string; percentUsed: number; resetsAt?: number }
export type Snapshot = {
  segments: Segment[]
  total: number
  max: number
  percent: number
  startedAt: number
  limits: Limit[]
  // Tokens left before auto-compaction runs; absent when it is off.
  compactIn?: number
}

export type Row = { name: string; tokens: number; note?: string }
export type Details = {
  model: string
  max: number
  total: number
  categories: { name: string; color: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]
  memoryFiles: Row[]
  mcpServers: Row[]
  agents: Row[]
  skills?: { total: number; included: number; tokens: number; top: Row[] }
  commands?: { total: number; included: number; tokens: number }
  api: { uncached: number; cacheRead: number; cacheWrite: number; output: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { isOn: boolean; snapshot: Snapshot | null; now: number; details: Details | null; isDetailsOpen: boolean }
  }
}
