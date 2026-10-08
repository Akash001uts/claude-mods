import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pin } from '../types'

const PLUGIN = 'session-pins'
const MAX_PINS = 20
const MAX_CHARS = 1000
// Pins rows shown above the prompt before "+N more"; context-bar shares the band.
const MAX_ROWS = 3
// Sessions kept in the store, so resume brings pins back without the store growing forever.
const MAX_SESSIONS = 50

const pins = atom({ plugin: 'session-pins', key: 'pins' } as const, [])
const isHidden = atom({ plugin: 'session-pins', key: 'isHidden' } as const, false)
const expanded = atom({ plugin: 'session-pins', key: 'expanded' } as const, null)

type Saved = { pins: Pin[]; savedAt: number }
const sessionKey = (id: string) => `session:${id}`

// The person's last prompt typed at the prompt box, for /pin with nothing after it.
let lastPrompt = ''

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

// Splits a pin into plain text and URLs, so the URLs draw as links. Trailing punctuation stays text.
export const parts = (text: string) =>
  text.split(/(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]])/).filter(Boolean).map(part => ({ part, isUrl: /^https?:\/\//.test(part) }))

export type Piece = { text: string; href?: string }
const LINK_MIN = 24

// Cut to `max` characters, ending in an ellipsis.
const cut = (text: string, max: number) => (text.length <= max ? text : max <= 1 ? '…' : `${text.slice(0, max - 1).trimEnd()}…`)

// A link's text, shortened from the middle so the site and the end of the path both show.
const shortUrl = (url: string, max: number) => {
  if (url.length <= max) return url
  const bare = url.replace(/^https?:\/\//, '')
  if (bare.length <= max) return bare
  const tail = Math.floor((max - 1) / 3)
  return `${bare.slice(0, max - 1 - tail)}…${bare.slice(-tail)}`
}

// Fits a pin into `width` columns so its links stay on screen: the plain text after the last link gives way first,
// then the text before it, then the links' labels shrink (each still opens the full URL).
export function fit(text: string, width: number): Piece[] {
  const pieces: Piece[] = parts(text).map(({ part, isUrl }) => (isUrl ? { text: part, href: part } : { text: part }))
  let over = pieces.reduce((n, p) => n + p.text.length, 0) - width
  for (let i = pieces.length - 1; i >= 0 && over > 0; i--) {
    const p = pieces[i]!
    if (p.href || p.text.length <= 1) continue
    const keep = Math.max(1, p.text.length - over)
    over -= p.text.length - keep
    pieces[i] = { text: cut(p.text, keep) }
  }
  for (let i = 0; i < pieces.length && over > 0; i++) {
    const p = pieces[i]!
    if (!p.href || p.text.length <= LINK_MIN) continue
    const keep = Math.max(LINK_MIN, p.text.length - over)
    over -= p.text.length - keep
    pieces[i] = { text: shortUrl(p.href, keep), href: p.href }
  }
  return pieces
}

// Only changes when the pins do, so it doesn't re-cache the conversation every turn.
export const section = (list: readonly Pin[]) =>
  [
    '# Pinned notes',
    'The user pinned these to the top of this session. Treat them as standing instructions and context for the whole session: they still apply after compaction, until the user unpins them. Don\'t comment on them unless asked.',
    ...list.map((p, i) => `${i + 1}. ${p.text}`),
  ].join('\n')

async function save($: EngineInterface, list: Pin[]) {
  await update($, pins, () => list)
  const key = sessionKey(await $.session.id())
  if (list.length === 0) return $.store.delete(key)
  const saved: Saved = { pins: list, savedAt: await $.clock.now() }
  await $.store.set(key, saved)
  const keys = (await $.store.keys()).filter(k => k.startsWith('session:'))
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SESSIONS))) await $.store.delete(old)
}

async function load($: EngineInterface) {
  const saved = (await $.store.get(sessionKey(await $.session.id()))) as Saved | undefined
  await update($, pins, () => saved?.pins ?? [])
}

const list = (all: readonly Pin[]) =>
  all.length === 0 ? 'Nothing pinned. /pin <text> pins a note; /pin on its own pins your last message.' : all.map((p, i) => `${i + 1}. ${p.text}`).join('\n')

async function add($: EngineInterface, text: string) {
  const now = await read($, pins)
  if (now.length >= MAX_PINS) return `You already have ${MAX_PINS} pins. /unpin one first.`
  const clean = text.trim().slice(0, MAX_CHARS)
  if (now.some(p => p.text === clean)) return 'That\'s already pinned.'
  await save($, [...now, { text: clean, pinnedAt: await $.clock.now() }])
  await update($, isHidden, () => false)
  return `Pinned (#${now.length + 1}). Claude sees it for the rest of the session.`
}

async function remove($: EngineInterface, arg: string) {
  const now = await read($, pins)
  if (now.length === 0) return 'Nothing pinned.'
  if (arg === 'all') {
    await save($, [])
    return `Unpinned all ${now.length}.`
  }
  // No number: the most recent pin.
  const n = arg === '' ? now.length : Number(arg)
  if (!Number.isInteger(n) || n < 1 || n > now.length) return `Usage: /unpin [1-${now.length} | all]`
  await save($, now.filter((_, i) => i !== n - 1))
  return `Unpinned #${n}: ${oneLine(now[n - 1]!.text).slice(0, 80)}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pin',
      description: 'Pin a note to this session (shown above the prompt, kept in Claude\'s context); on its own pins your last message',
      argumentHint: '[<text> | list | hide | show]',
    })
    await $.command.register({
      name: 'unpin',
      description: 'Unpin a note: /unpin 2, /unpin all; on its own unpins the latest',
      argumentHint: '[<number> | all]',
    })
    // A new or resumed session reads its own pins; a hot reload reads back the same ones.
    await load($).catch(() => {})
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' && !e.text.trimStart().startsWith('/')) lastPrompt = e.text
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const all = await read($, pins)
    if (all.length === 0) return composed
    return { ...composed, sections: [...composed.sections, { id: `${PLUGIN}:pins`, text: section(all), scope: 'session' as const }] }
  })

  on('command.run', { command: 'pin' }, async ($, e) => {
    const arg = e.args.trim()
    const word = arg.toLowerCase()
    if (word === 'list') return { text: list(await read($, pins)) }
    if (word === 'hide' || word === 'show') {
      await update($, isHidden, () => word === 'hide')
      return { text: word === 'hide' ? 'Pins hidden above the prompt (Claude still sees them). /pin show brings them back.' : 'Pins shown above the prompt.' }
    }
    if (arg) return { text: await add($, arg) }
    if (!lastPrompt.trim()) return { text: 'Nothing to pin yet. Use /pin <text>, or send a message first and run /pin to pin it.' }
    return { text: await add($, lastPrompt) }
  })

  on('command.run', { command: 'unpin' }, async ($, e) => ({ text: await remove($, e.args.trim().toLowerCase()) }))

  // Pins sit on top of whatever else draws above the prompt (context-bar's band included).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const all = await read($, pins)
    if (e.props.hasSurvey || all.length === 0 || (await read($, isHidden))) return next(e)
    const beneath = await next(e)
    const { Box, Text, Link, Button } = $.ui.resolve(e)
    const open = await read($, expanded)
    const toggle = (at: string | null) => () => void update($, expanded, () => at).catch(() => {})
    const linked = (pieces: Piece[]) => pieces.map(piece => (piece.href ? <Link href={piece.href}>{piece.text}</Link> : piece.text))
    const room = Math.max(1, Math.min(MAX_ROWS, Math.floor(e.props.maxRows / 3)))
    // The last row left says how many more there are; with one row, it shares the first pin's line.
    const shown = all.length > room ? all.slice(0, Math.max(1, room - 1)) : all
    const more = all.length - shown.length
    const isSqueezed = more > 0 && room === 1

    return (
      <Box flexDirection="column">
        {shown.map((p, i) => {
          const number = all.length > 1 ? `${i + 1}. ` : ''
          const squeeze = isSqueezed ? `(+${more} more) ` : ''
          // The pin glyph takes two columns and a space.
          const width = e.props.bodyColumns - 3 - number.length - squeeze.length
          const text = oneLine(p.text)
          const head = (
            <Text>
              <Text color="yellow">📌 </Text>
              <Text dimColor>{number}</Text>
              {squeeze && <Text dimColor>{squeeze}</Text>}
            </Text>
          )
          // Opened out: the whole pin, wrapped, links live, and a way to fold it back.
          if (open === p.text)
            return (
              <Box flexDirection="column">
                <Text wrap="wrap">
                  {head}
                  {linked(fit(text, Infinity))}
                </Text>
                <Button key={`less-${i + 1}`} plain dimColor label="   ▴ show less" onPress={toggle(null)} />
              </Box>
            )
          if (text.length <= width)
            return (
              <Text wrap="truncate">
                {head}
                {linked(fit(text, width))}
              </Text>
            )
          // Cut off: the text either side of a link opens it out, the link stays a link, and a ▾ at the end says there's more.
          return (
            <Box flexDirection="row">
              {head}
              {fit(text, width - 2).map((piece, j) =>
                piece.href ? (
                  <Text>
                    <Link href={piece.href}>{piece.text}</Link>
                  </Text>
                ) : (
                  <Button key={`more-${i + 1}-${j}`} plain label={piece.text} onPress={toggle(p.text)} />
                ),
              )}
              <Button key={`more-${i + 1}`} plain dimColor label=" ▾" onPress={toggle(p.text)} />
            </Box>
          )
        })}
        {more > 0 && !isSqueezed && <Text dimColor>   +{more} more (/pin list)</Text>}
        {beneath}
      </Box>
    )
  })
}
