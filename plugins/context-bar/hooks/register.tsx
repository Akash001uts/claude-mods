import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Details, Limit, Row, Segment, Snapshot } from '../types'

// On at the start of every session; /context-bar hides it for that session only.
const isOn = atom({ plugin: 'context-bar', key: 'isOn' } as const, true)
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)
// The time the band last read, bumped each minute so the session length and reset countdowns move.
const now = atom({ plugin: 'context-bar', key: 'now' } as const, 0)
const details = atom({ plugin: 'context-bar', key: 'details' } as const, null)
const isDetailsOpen = atom({ plugin: 'context-bar', key: 'isDetailsOpen' } as const, false)

const PANE = 'context-details'
const GLYPH = { used: '█', buffer: '▒', free: '░' } as const
const REFRESH_MS = 3000
const TICK_MS = 60_000
const LIMIT_LABEL: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

export const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

export const span = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60_000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

// The band's third line: rate limits, room before compaction, session length.
export const infoLine = (snap: Snapshot, at: number) => {
  const parts = snap.limits.map(l => {
    const label = LIMIT_LABEL[l.kind] ?? l.kind
    const reset = l.resetsAt !== undefined && l.resetsAt > at ? ` (resets in ${span(l.resetsAt - at)})` : ''
    return `${label} ${l.percentUsed}%${reset}`
  })
  if (snap.compactIn !== undefined) parts.push(`${short(snap.compactIn)} to compact`)
  if (snap.startedAt > 0 && at >= snap.startedAt) parts.push(`session ${span(at - snap.startedAt)}`)
  return parts.join('  ·  ')
}

// Split `width` cells across segments by largest remainder, giving every
// non-empty used segment at least one cell so small categories stay visible.
export const allocate = (segments: Segment[], max: number, width: number): number[] => {
  if (max <= 0 || width <= 0) return segments.map(() => 0)
  const exact = segments.map(s => (s.tokens / max) * width)
  const cells = exact.map((x, i) => (segments[i]!.kind === 'used' && segments[i]!.tokens > 0 ? Math.max(1, Math.floor(x)) : Math.floor(x)))
  let spare = width - cells.reduce((a, b) => a + b, 0)
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; spare > 0 && order.length > 0; k = (k + 1) % order.length, spare--) cells[order[k]![1]]! += 1
  // Over budget from the minimum-one rule: take cells back from the free space, then the largest.
  while (spare < 0) {
    const free = segments.findIndex((s, i) => s.kind === 'free' && cells[i]! > 0)
    const i = free >= 0 ? free : cells.indexOf(Math.max(...cells))
    cells[i]! -= 1
    spare++
  }
  return cells
}

const toLimit = (l: SessionRateLimit): Limit => {
  const at = l.resetsAt ? Date.parse(l.resetsAt) : NaN
  return Number.isNaN(at) ? { kind: l.kind, percentUsed: l.percentUsed } : { kind: l.kind, percentUsed: l.percentUsed, resetsAt: at }
}

// The last two parts of a path, so memory files read as `.claude/CLAUDE.md`.
const tail = (path: string) => {
  const parts = path.split(/[\\/]+/).filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : parts.join('/')
}

const byTokens = (a: Row, b: Row) => b.tokens - a.tokens

let lastFetch = 0
let isFetching = false
let isFetchingDetails = false
let tick: { cancel: () => void } | undefined

async function refresh($: EngineInterface, force = false) {
  const at = await $.clock.now()
  if (isFetching || (!force && at - lastFetch < REFRESH_MS)) return
  if (!(await read($, isOn))) return
  isFetching = true
  lastFetch = at
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const b = usage.context.breakdown
    if (!b) return
    const segments: Segment[] = b.categories
      .filter(c => c.kind !== 'deferred' && c.tokens > 0)
      .map(c => ({ name: c.name, color: c.color, tokens: c.tokens, kind: c.kind as Segment['kind'] }))
    const next: Snapshot = {
      segments,
      total: b.totalTokens,
      max: b.rawMaxTokens,
      percent: b.percentage,
      startedAt: usage.startedAt,
      limits: usage.rateLimits.map(toLimit),
    }
    if (b.isAutoCompactEnabled && b.autoCompactThreshold !== undefined) next.compactIn = Math.max(0, b.autoCompactThreshold - b.totalTokens)
    // Time first, so the new snapshot never draws against a stale clock.
    await update($, now, () => at)
    await update($, snapshot, () => next)
  } finally {
    isFetching = false
  }
}

// The full breakdown counts every tool and memory file, as /context does, so it
// is read only for the details pane: on opening it and after each turn while it is open.
async function refreshDetails($: EngineInterface) {
  if (isFetchingDetails) return
  isFetchingDetails = true
  try {
    const b = (await $.session.usage({ breakdown: 'full' })).context.breakdown
    if (!b) return
    const servers = new Map<string, { tokens: number; tools: number; loaded: number }>()
    for (const t of b.mcpTools) {
      const s = servers.get(t.serverName) ?? { tokens: 0, tools: 0, loaded: 0 }
      servers.set(t.serverName, { tokens: s.tokens + t.tokens, tools: s.tools + 1, loaded: s.loaded + (t.isLoaded ? 1 : 0) })
    }
    const next: Details = {
      model: b.model,
      max: b.rawMaxTokens,
      total: b.totalTokens,
      categories: b.categories.filter(c => c.tokens > 0).map(c => ({ name: c.name, color: c.color, tokens: c.tokens, kind: c.kind })),
      memoryFiles: b.memoryFiles.map(f => ({ name: tail(f.path), tokens: f.tokens, note: f.type })).sort(byTokens),
      mcpServers: [...servers]
        .map(([name, s]) => ({ name, tokens: s.tokens, note: `${s.loaded}/${s.tools} tools loaded` }))
        .sort(byTokens),
      agents: b.agents.map(a => ({ name: a.agentType, tokens: a.tokens, note: a.source })).sort(byTokens),
      api: b.apiUsage && {
        uncached: b.apiUsage.input_tokens,
        cacheRead: b.apiUsage.cache_read_input_tokens,
        cacheWrite: b.apiUsage.cache_creation_input_tokens,
        output: b.apiUsage.output_tokens,
      },
    }
    if (b.skills)
      next.skills = {
        total: b.skills.totalSkills,
        included: b.skills.includedSkills,
        tokens: b.skills.tokens,
        top: b.skills.skillFrontmatter
          .map(s => ({ name: s.name, tokens: s.tokens, note: s.pluginName ?? s.source }))
          .sort(byTokens)
          .slice(0, 10),
      }
    if (b.slashCommands)
      next.commands = { total: b.slashCommands.totalCommands, included: b.slashCommands.includedCommands, tokens: b.slashCommands.tokens }
    await update($, details, () => next)
  } finally {
    isFetchingDetails = false
  }
}

async function openDetails($: EngineInterface) {
  await update($, isDetailsOpen, () => true)
  await $.ui.open({ id: PANE, title: 'Context details' })
  await refreshDetails($).catch(() => {})
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Toggle the context window bar above the prompt; /context-bar details opens a token breakdown',
    })
    // Only a session that draws the band needs the minute ticker; a reload drops
    // the old module's timers, and the cancel covers session.start firing twice in one load.
    tick?.cancel()
    if (e.isInteractive)
      tick = $.clock.every(TICK_MS, () => {
        void $.clock.now().then(at => update($, now, () => at))
      })
    // Draw the bar as soon as the session opens; never let a failed read block startup.
    await refresh($, true).catch(() => {})
    return next(e)
  })

  on('command.run', { command: 'context-bar' }, async ($, e) => {
    if (e.args.trim().toLowerCase() === 'details') {
      await openDetails($)
      return { text: 'Context details opened.' }
    }
    const nextOn = !(await read($, isOn))
    await update($, isOn, () => nextOn)
    if (nextOn) await refresh($, true)
    return { text: nextOn ? 'Context bar on.' : 'Context bar off.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) await update($, isDetailsOpen, () => false)
    return next(e)
  })

  on('session.measure', ($, e, next) => {
    void refresh($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    void refresh($, true)
    if (await read($, isDetailsOpen)) void refreshDetails($).catch(() => {})
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isOn))) return next(e)
    const snap = await read($, snapshot)
    if (!snap || snap.segments.length === 0) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const summary = ` ${snap.percent}% ${short(snap.total)}/${short(snap.max)}`
    const width = Math.max(10, e.props.bodyColumns - summary.length)
    const cells = allocate(snap.segments, snap.max, width)
    const used = snap.segments.filter(s => s.kind === 'used')
    const info = e.props.maxRows >= 3 ? infoLine(snap, await read($, now)) : ''

    return (
      <Box flexDirection="column">
        <Text>
          {snap.segments.map((s, i) =>
            cells[i]! > 0 ? (
              <Text color={s.color} dimColor={s.kind === 'free'}>
                {GLYPH[s.kind].repeat(cells[i]!)}
              </Text>
            ) : null,
          )}
          <Text dimColor>{summary}</Text>
        </Text>
        <Text wrap="truncate">
          {used.map(s => (
            <Text>
              <Text color={s.color}>■</Text>
              <Text dimColor> {s.name} {short(s.tokens)}  </Text>
            </Text>
          ))}
        </Text>
        {info ? (
          <Text wrap="truncate" dimColor>
            {info}
          </Text>
        ) : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = await read($, details)
    const refreshButton = <Button key="refresh" label="Refresh" hotkey="r" dimColor onPress={() => refreshDetails($).catch(() => {})} />
    if (!d)
      return (
        <Box flexDirection="column">
          <Text dimColor>Counting tokens…</Text>
          {refreshButton}
        </Box>
      )

    const pct = (n: number) => (d.max > 0 ? `${((n / d.max) * 100).toFixed(1)}%` : '')
    const line = (r: Row, color?: string) => (
      <Box flexDirection="row">
        <Box flexGrow={1}>
          <Text wrap="truncate">
            {color ? <Text color={color}>■ </Text> : '  '}
            {r.name}
            {r.note ? <Text dimColor>  {r.note}</Text> : null}
          </Text>
        </Box>
        <Text>
          {' '}
          {short(r.tokens).padStart(6)} <Text dimColor>{pct(r.tokens).padStart(6)}</Text>
        </Text>
      </Box>
    )
    const section = (title: string, rows: Row[], extra?: string) =>
      rows.length === 0 ? null : (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>
            {title}
            {extra ? <Text dimColor>  {extra}</Text> : null}
          </Text>
          {rows.map(r => line(r))}
        </Box>
      )

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold>{d.model}</Text>
          <Text dimColor>
            {'  '}
            {short(d.total)}/{short(d.max)} ({pct(d.total)})
          </Text>
        </Text>
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Categories</Text>
          {d.categories.map(c => line({ name: c.name, tokens: c.tokens, note: c.kind === 'deferred' ? 'loaded on demand' : undefined }, c.color))}
        </Box>
        {section('Memory files', d.memoryFiles)}
        {section('MCP servers', d.mcpServers)}
        {d.skills ? section('Skills', d.skills.top, `${d.skills.included}/${d.skills.total} listed, ${short(d.skills.tokens)} in all; largest shown`) : null}
        {section('Custom agents', d.agents)}
        {d.commands ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Slash commands</Text>
            <Text dimColor>
              {'  '}
              {d.commands.included}/{d.commands.total} listed, {short(d.commands.tokens)} tokens
            </Text>
          </Box>
        ) : null}
        {d.api ? (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Last API call</Text>
            <Text dimColor>
              {'  '}cache read {short(d.api.cacheRead)}  ·  cache write {short(d.api.cacheWrite)}  ·  uncached {short(d.api.uncached)}  ·  output{' '}
              {short(d.api.output)}
            </Text>
          </Box>
        ) : null}
        <Box marginTop={1}>{refreshButton}</Box>
      </Box>
    )
  })
}
