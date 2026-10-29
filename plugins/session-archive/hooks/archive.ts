// What the archive knows about a transcript: parsing its JSONL lines, the Markdown copy, the stats and the cost.
// No `$` in here, so it can be tested on plain text.

import type { Day, Entry, Tokens } from '../types'

export const EMPTY: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

// Prices in US$ per million tokens, from Anthropic's model table as of PRICES_DATE. Cache writes are 1.25x input,
// cache reads 0.1x. First match wins, so the more specific names come first. Update these when prices change.
export const PRICES_DATE = '2026-10-06'
const PRICES: [RegExp, number, number][] = [
  [/fable|mythos/, 10, 50],
  [/opus-5-5/, 4, 20],
  [/opus-5|opus-4-[5-9]/, 5, 25],
  [/sonnet-5/, 2, 10],
  [/sonnet-4/, 3, 15],
  [/haiku-5-5/, 0.1, 0.5],
  [/haiku-4-5/, 1, 5],
]

export const price = (model: string) => PRICES.find(([match]) => match.test(model))

// Rough cost of some tokens on one model, or undefined when the model isn't in the table.
export function cost(model: string, t: Tokens) {
  const found = price(model)
  if (!found) return undefined
  const [, input, output] = found
  return (t.input * input + t.cacheWrite * input * 1.25 + t.cacheRead * input * 0.1 + t.output * output) / 1e6
}

export const add = (a: Tokens, b: Tokens): Tokens => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
})

export const total = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite

const pad = (n: number) => String(n).padStart(2, '0')
// Local date, so a day is the person's own day.
export const dayOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Line = {
  type?: string
  isMeta?: boolean
  isSidechain?: boolean
  timestamp?: string
  sessionId?: string
  cwd?: string
  message?: { id?: string; role?: string; model?: string; content?: unknown; usage?: Record<string, number> }
}

type Block = { type?: string; text?: string; name?: string; input?: unknown; content?: unknown; id?: string; tool_use_id?: string }

export function lines(jsonl: string): Line[] {
  const out: Line[] = []
  for (const raw of jsonl.split('\n')) {
    if (!raw.trim()) continue
    try {
      out.push(JSON.parse(raw) as Line)
    } catch {
      // A line cut short by a write in progress: skip it, the next copy has it whole.
    }
  }
  return out
}

const blocks = (content: unknown): Block[] => (Array.isArray(content) ? (content as Block[]) : typeof content === 'string' ? [{ type: 'text', text: content }] : [])

// The person's own words: a user row with text, not a tool result, not something the engine added.
export const isTyped = (l: Line) =>
  l.type === 'user' && !l.isMeta && !l.isSidechain && blocks(l.message?.content).some(b => b.type === 'text' && b.text?.trim() && !b.text.startsWith('<'))

export type Parsed = {
  id: string
  root: string
  started: number
  ended: number
  messages: number
  days: Record<string, Day>
  hours: number[]
  // The opening of the conversation, for the title.
  opening: string
  // Everything said, for the end-of-session retitle and plain search.
  firstPrompt: string
}

const usageOf = (u: Record<string, number> | undefined): Tokens => ({
  input: u?.input_tokens ?? 0,
  output: u?.output_tokens ?? 0,
  cacheRead: u?.cache_read_input_tokens ?? 0,
  cacheWrite: u?.cache_creation_input_tokens ?? 0,
})

// Counts messages per day and hour, and tokens per day per model. Subagent tokens count (they were spent), their
// messages don't. One response can be split over several lines that share a message id: its usage counts once.
export function parse(all: Line[], fallbackId: string): Parsed {
  const days: Record<string, Day> = {}
  const hours = new Array<number>(24).fill(0)
  const seen = new Set<string>()
  let started = Infinity
  let ended = 0
  let messages = 0
  let opening = ''
  let firstPrompt = ''
  let id = fallbackId
  let root = ''
  for (const l of all) {
    if (l.sessionId) id = l.sessionId
    if (l.cwd && !root) root = l.cwd
    const at = l.timestamp ? Date.parse(l.timestamp) : NaN
    if (Number.isNaN(at)) continue
    started = Math.min(started, at)
    ended = Math.max(ended, at)
    const day = (days[dayOf(at)] ??= { messages: 0, tokens: {} })
    if (isTyped(l)) {
      messages++
      day.messages++
      hours[new Date(at).getHours()]!++
      const text = blocks(l.message?.content).filter(b => b.type === 'text').map(b => b.text).join('\n')
      if (!firstPrompt) firstPrompt = text
      if (opening.length < 6000) opening += `User: ${text}\n\n`
    }
    if (l.type === 'assistant' && l.message?.usage) {
      const key = l.message.id ?? `${at}`
      if (!seen.has(key)) {
        seen.add(key)
        const model = l.message.model ?? 'unknown'
        if (model !== '<synthetic>') day.tokens[model] = add(day.tokens[model] ?? EMPTY, usageOf(l.message.usage))
      }
      if (!l.isSidechain && opening.length < 6000) {
        const text = blocks(l.message.content).filter(b => b.type === 'text').map(b => b.text).join('\n')
        if (text.trim()) opening += `Claude: ${text.slice(0, 1500)}\n\n`
      }
    }
  }
  for (const [day, d] of Object.entries(days)) if (d.messages === 0 && Object.keys(d.tokens).length === 0) delete days[day]
  return { id, root, started: started === Infinity ? 0 : started, ended, messages, days, hours, opening: opening.slice(0, 6000), firstPrompt }
}

// Tool output longer than this folds under a summary line in the Markdown copy.
const FOLD_LINES = 15

const fence = (text: string) => {
  const ticks = (text.match(/`{3,}/g) ?? []).reduce((n, run) => Math.max(n, run.length + 1), 3)
  return `${'`'.repeat(ticks)}\n${text}\n${'`'.repeat(ticks)}`
}

const resultText = (content: unknown) =>
  typeof content === 'string' ? content : blocks(content).map(b => (b.type === 'text' ? b.text : `[${b.type}]`)).join('\n')

const callLine = (b: Block) => {
  const input = (b.input ?? {}) as Record<string, unknown>
  const main = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.query ?? input.description
  return `**${b.name}**${typeof main === 'string' ? ` \`${main.replace(/`/g, "'").slice(0, 300)}\`` : ''}`
}

export const output = (text: string) => {
  const rows = text.split('\n')
  if (rows.length <= FOLD_LINES) return fence(text)
  return `<details><summary>Output (${rows.length} lines)</summary>\n\n${fence(text)}\n\n</details>`
}

// The readable copy: your messages and Claude's replies in full, each tool call with its output (folded when long),
// no thinking, no subagent chatter (the Task call's result carries the subagent's report).
export function markdown(all: Line[], title: string, id: string): string {
  const out = [`# ${title}`, '', `Session \`${id}\``, '']
  let speaker = ''
  const head = (who: string) => {
    if (speaker !== who) out.push(`## ${who}`, '')
    speaker = who
  }
  for (const l of all) {
    if (l.isSidechain || l.isMeta) continue
    const bs = blocks(l.message?.content)
    if (l.type === 'user') {
      for (const b of bs) {
        if (b.type === 'tool_result') out.push(output(resultText(b.content)), '')
        else if (b.type === 'text' && b.text?.trim() && !b.text.startsWith('<')) {
          head('You')
          out.push(b.text, '')
        }
      }
    } else if (l.type === 'assistant') {
      for (const b of bs) {
        if (b.type === 'text' && b.text?.trim()) {
          head('Claude')
          out.push(b.text, '')
        } else if (b.type === 'tool_use') {
          head('Claude')
          out.push(callLine(b), '')
        }
      }
    }
  }
  return out.join('\n')
}

// The same, from the session's own messages: for a transcript too big to read whole (over 4 MiB).
export function markdownFromMessages(
  msgs: readonly { role: string; text: string; toolUses: readonly { tool: string; input: Record<string, unknown>; text?: string }[] }[],
  title: string,
  id: string,
): string {
  const out = [`# ${title}`, '', `Session \`${id}\``, '']
  for (const m of msgs) {
    if (m.role === 'user' && m.text.trim() && !m.text.startsWith('<')) out.push('## You', '', m.text, '')
    if (m.role === 'assistant') {
      if (m.text.trim() || m.toolUses.length) out.push('## Claude', '')
      if (m.text.trim()) out.push(m.text, '')
      for (const t of m.toolUses) out.push(callLine({ name: t.tool, input: t.input }), '', ...(t.text !== undefined ? [output(t.text), ''] : []))
    }
  }
  return out.join('\n')
}

// A file-name-safe title.
export const safe = (text: string) =>
  text
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '') || 'session'

// Stats over a set of sessions. `from` is the first day counted (YYYY-MM-DD), or '' for all time.
export function stats(entries: readonly Entry[], from: string, today: string) {
  const byDay = new Map<string, { messages: number; tokens: Record<string, Tokens> }>()
  const hours = new Array<number>(24).fill(0)
  const perModel: Record<string, Tokens> = {}
  const perProject: Record<string, number> = {}
  let sessions = 0
  let messages = 0
  for (const e of entries) {
    const days = Object.entries(e.days).filter(([d]) => d >= from)
    if (days.length === 0) continue
    sessions++
    for (const [d, v] of days) {
      const slot = byDay.get(d) ?? { messages: 0, tokens: {} }
      slot.messages += v.messages
      messages += v.messages
      for (const [model, t] of Object.entries(v.tokens)) {
        slot.tokens[model] = add(slot.tokens[model] ?? EMPTY, t)
        perModel[model] = add(perModel[model] ?? EMPTY, t)
        perProject[e.project] = (perProject[e.project] ?? 0) + (cost(model, t) ?? 0)
      }
      byDay.set(d, slot)
    }
    e.hours.forEach((n, hr) => (hours[hr]! += n))
  }
  // A day with a message counts toward a streak, whichever session it belongs to.
  const active = [...byDay.entries()].filter(([, v]) => v.messages > 0).map(([d]) => d).sort()
  let longest = 0
  let run = 0
  let prev = ''
  for (const d of active) {
    run = prev && nextDay(prev) === d ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  let current = 0
  for (let d = active.includes(today) ? today : prevDay(today); active.includes(d); d = prevDay(d)) current++
  const dayCost = (d: string) => Object.entries(byDay.get(d)?.tokens ?? {}).reduce((n, [m, t]) => n + (cost(m, t) ?? 0), 0)
  const month = today.slice(0, 7)
  const monthCost = [...byDay.keys()].filter(d => d.startsWith(month)).reduce((n, d) => n + dayCost(d), 0)
  const allCost = [...byDay.keys()].reduce((n, d) => n + dayCost(d), 0)
  const tokens = Object.values(perModel).reduce((n, t) => n + total(t), 0)
  const unpriced = Object.entries(perModel).filter(([m]) => !price(m)).reduce((n, [, t]) => n + total(t), 0)
  const favourite = Object.entries(perModel).sort((a, b) => total(b[1]) - total(a[1]))[0]?.[0]
  const peak = hours.some(n => n > 0) ? hours.indexOf(Math.max(...hours)) : undefined
  return {
    sessions,
    messages,
    tokens,
    activeDays: active.length,
    current,
    longest,
    peak,
    favourite,
    perModel,
    perProject,
    byDay,
    today: dayCost(today),
    month: monthCost,
    all: allCost,
    unpriced,
  }
}

export const nextDay = (d: string) => shift(d, 1)
export const prevDay = (d: string) => shift(d, -1)
function shift(d: string, by: number) {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number]
  return dayOf(new Date(y, m - 1, day + by, 12).getTime())
}
