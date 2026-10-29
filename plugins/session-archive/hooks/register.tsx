import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Day, Entry, Settings } from '../types'
import { PRICES_DATE, add, dayOf, lines, markdown, markdownFromMessages, nextDay, parse, prevDay, safe, stats, total } from './archive'

const PANE = 'session-stats'
// A busy session copies at most this often; the end of the session always copies.
const COPY_EVERY = 3 * 60_000
// $.fs reads and writes up to 4 MiB; a bigger transcript is copied by the system's own copy command.
const MAX_READ = 4 * 1024 * 1024
// Sessions searched by meaning, most recent first (titles, summaries and keywords only).
const MAX_MEANING = 600
// Copies opened by a plain-text search, most recent first.
const MAX_PLAIN = 400

const range = atom({ plugin: 'session-archive', key: 'range' } as const, 'all')
const isHere = atom({ plugin: 'session-archive', key: 'isHere' } as const, false)

export const NEW_FOLDER = 'New folder ~/claude-sessions'
export const IN_PLACE = 'Leave them where they are'
export const FORMATS = { 'Raw transcript': 'raw', Markdown: 'md', Both: 'both' } as const
export const MEANING = 'By meaning (uses a few tokens)'
export const PLAIN = 'Plain text (free)'
export const COPY_NOW = 'Copy them now'
export const NOT_NOW = 'Not now'

const offKey = (root: string) => `off:${root.replace(/\\/g, '/').toLowerCase()}`

// Where each session's copy was last made, so a busy session copies every few minutes, not every turn.
const lastCopy = new Map<string, number>()
// Tokens and messages counted from turns since the last time the transcript could be read whole, for one too
// big to read (over 4 MiB): its stats keep counting.
let since: Record<string, Day> = {}
let isDraining = false
let hasWarnedMissing = false

async function home($: EngineInterface) {
  return ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
}

async function configDir($: EngineInterface) {
  return ((await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}/.claude`).replace(/\\/g, '/')
}

async function machine($: EngineInterface) {
  const name = (await $.env.get('COMPUTERNAME')) ?? (await $.env.get('HOSTNAME')) ?? 'this-pc'
  return safe(name).replace(/ /g, '-').toLowerCase()
}

const getSettings = async ($: EngineInterface) => (await $.store.get('settings')) as Settings | undefined

// The index lives in the archive folder; with sessions left in place, in this mod's own folder.
async function indexDir($: EngineInterface, s: Settings) {
  return s.folder ?? `${await configDir($)}/session-archive`
}

// This machine's index. Each machine writes only its own, so two PCs sharing a OneDrive folder never clash.
async function readOwn($: EngineInterface, s: Settings): Promise<Record<string, Entry>> {
  const path = `${await indexDir($, s)}/index-${await machine($)}.json`
  const text = await $.fs.read(path).catch(() => '')
  try {
    return text ? (JSON.parse(text) as Record<string, Entry>) : {}
  } catch {
    return {}
  }
}

async function writeOwn($: EngineInterface, s: Settings, all: Record<string, Entry>) {
  await $.fs.write(`${await indexDir($, s)}/index-${await machine($)}.json`, JSON.stringify(all))
}

// Every machine's index in the folder, newest copy of a session winning.
export async function readAll($: EngineInterface, s: Settings): Promise<Entry[]> {
  const dir = await indexDir($, s)
  const files = (await $.fs.list(dir).catch(() => [])).filter(f => /^index-.+\.json$/.test(f.name))
  const merged = new Map<string, Entry>()
  for (const f of files) {
    const text = await $.fs.read(`${dir}/${f.name}`).catch(() => '')
    let some: Record<string, Entry> = {}
    try {
      some = text ? (JSON.parse(text) as Record<string, Entry>) : {}
    } catch {}
    for (const e of Object.values(some)) {
      const had = merged.get(e.id)
      if (!had || had.ended < e.ended) merged.set(e.id, e)
    }
  }
  return [...merged.values()].sort((a, b) => b.ended - a.ended)
}

async function folderIsThere($: EngineInterface, s: Settings) {
  if (!s.folder) return true
  const stat = await $.fs.stat(s.folder).catch(() => undefined)
  return stat?.kind === 'dir'
}

const projectOf = (root: string) => root.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'unknown'

// A short title, a two-line summary and keywords, from the opening of the conversation. Haiku, a few hundred tokens.
async function describe($: EngineInterface, opening: string, firstPrompt: string, was?: Entry) {
  const fallback = { title: safe(firstPrompt.split(/\s+/).slice(0, 6).join(' ')) || 'Untitled session', summary: '', keywords: [] as string[] }
  if (!opening.trim()) return was ?? fallback
  const keep = was?.title ? `It was titled "${was.title}". Keep that title unless the session clearly moved to another topic.\n` : ''
  const r = await $.model.complete({
    model: 'haiku',
    maxTokens: 300,
    system: 'You name coding-assistant sessions for an archive. Reply with JSON only.',
    prompt: `${keep}Give this session a 3 to 5 word title (plain words, no quotes or punctuation at the ends), a summary of at most two short lines, and up to 8 search keywords.\nReply as {"title": "...", "summary": "...", "keywords": ["..."]}.\n\n${opening}`,
  })
  if (!r.isAnswered) return was?.title ? was : fallback
  try {
    const got = JSON.parse(r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1)) as { title?: string; summary?: string; keywords?: string[] }
    return {
      title: safe(got.title ?? '') || fallback.title,
      summary: String(got.summary ?? '').slice(0, 300),
      keywords: (got.keywords ?? []).map(String).slice(0, 8),
    }
  } catch {
    return was?.title ? was : fallback
  }
}

async function isWindows($: EngineInterface) {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// A transcript over 4 MiB can't pass through $.fs, so the system copies it.
async function bigCopy($: EngineInterface, from: string, to: string) {
  const dir = to.slice(0, to.lastIndexOf('/'))
  const isWin = await isWindows($)
  const win = (path: string) => path.replace(/\//g, '\\')
  // The folder may not exist yet (a new project); mkdir fails harmlessly when it does. On Windows mkdir and copy are
  // built into cmd, so cmd runs them.
  if (isWin) {
    await $.process.run(['cmd', '/c', 'mkdir', win(dir)]).catch(() => undefined)
    const r = await $.process.run(['cmd', '/c', 'copy', '/y', win(from), win(to)], { timeoutMs: 120_000 })
    if (r.exitCode !== 0) throw new Error(`copy failed: ${r.stderr.slice(0, 200)}`)
  } else {
    await $.process.run(['mkdir', '-p', dir]).catch(() => undefined)
    const r = await $.process.run(['cp', from, to], { timeoutMs: 120_000 })
    if (r.exitCode !== 0) throw new Error(`copy failed: ${r.stderr.slice(0, 200)}`)
  }
}

type CopyOptions = { isCurrent: boolean; isFinal: boolean }

// A copy this session already has in the project's folder (found by the id at the end of its name), so a session
// keeps one file even if its index entry went missing.
async function existing($: EngineInterface, dir: string, id: string) {
  const end = ` ${id.slice(0, 8)}`
  const found = (await $.fs.list(dir).catch(() => [])).find(f => f.kind === 'file' && /\.(jsonl|md)$/.test(f.name) && f.name.replace(/\.(jsonl|md)$/, '').endsWith(end))
  return found ? `${dir}/${found.name.replace(/\.(jsonl|md)$/, '')}` : undefined
}

// Copies one session into the archive and updates the index. Every copy of a session overwrites that session's own
// files, so the archive holds one copy per session, and the last one made covers all of it.
export async function copy($: EngineInterface, source: string, sessionId: string, o: CopyOptions) {
  const s = await getSettings($)
  if (!s) return
  const stat = await $.fs.stat(source).catch(() => undefined)
  if (!stat || stat.kind !== 'file') return
  if (!(await folderIsThere($, s))) {
    await queue($, [source])
    if (!hasWarnedMissing) {
      hasWarnedMissing = true
      $.ui.log(`session-archive: the archive folder ${s.folder} isn't there (drive unplugged or signed out?). Sessions are queued and copied once it's back.`)
    }
    return
  }
  const own = await readOwn($, s)
  const isBig = stat.size > MAX_READ
  const text = isBig ? '' : await $.fs.read(source)
  const all = isBig ? [] : lines(text)
  const p = isBig ? undefined : parse(all, sessionId)
  const id = p?.id ?? sessionId
  const was = own[id]
  const root = p?.root || was?.root || (o.isCurrent ? await $.session.root() : '')
  if (root && (await $.store.get(offKey(root)))) return
  let days = p?.days ?? was?.days ?? {}
  if (isBig && o.isCurrent) {
    days = { ...days }
    for (const [d, v] of Object.entries(since)) {
      const slot = (days[d] = { messages: (days[d]?.messages ?? 0) + v.messages, tokens: { ...(days[d]?.tokens ?? {}) } })
      for (const [m, t] of Object.entries(v.tokens)) slot.tokens[m] = add(slot.tokens[m] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, t)
    }
  }
  if (!isBig && o.isCurrent) since = {}
  const messages = p?.messages ?? was?.messages ?? 0
  if (messages === 0 && !was) return
  // Titled once there's something to name; the end of a session that has grown a lot is looked at again.
  const needsTitle = !was?.title || (o.isFinal && messages >= 6 && messages >= 2 * (was.titledAt || 1))
  const named = needsTitle && p ? await describe($, p.opening, p.firstPrompt, was) : was ?? { title: 'Untitled session', summary: '', keywords: [] }
  const project = projectOf(root)
  const started = p?.started || was?.started || stat.mtimeMs
  // The file name is set at the first copy and kept: a later title goes in the index and the Markdown heading.
  const file = s.folder ? was?.file || (await existing($, `${s.folder}/${safe(project)}`, id)) || `${s.folder}/${safe(project)}/${dayOf(started)} ${safe(named.title)} ${id.slice(0, 8)}` : ''
  if (file) {
    if (s.format !== 'md') {
      if (isBig) await bigCopy($, source, `${file}.jsonl`)
      else await $.fs.write(`${file}.jsonl`, text)
    }
    if (s.format !== 'raw') {
      if (!isBig) await $.fs.write(`${file}.md`, markdown(all, named.title, id))
      else if (o.isCurrent) await $.fs.write(`${file}.md`, markdownFromMessages(await $.session.messages(), named.title, id))
    }
  }
  own[id] = {
    id,
    machine: await machine($),
    project,
    root,
    title: named.title,
    summary: named.summary,
    keywords: named.keywords,
    started,
    ended: p?.ended || stat.mtimeMs,
    messages,
    days,
    hours: p?.hours ?? was?.hours ?? new Array<number>(24).fill(0),
    file,
    source,
    size: stat.size,
    titledAt: needsTitle ? messages : was?.titledAt ?? messages,
  }
  await writeOwn($, s, own)
}

// Sessions waiting to be copied (backfill, a missing folder, a session that changed since its last copy).
async function queue($: EngineInterface, paths: string[]) {
  const now = ((await $.store.get('queue')) as string[] | undefined) ?? []
  await $.store.set('queue', [...now, ...paths.filter(p => !now.includes(p))])
}

// Copies a few queued sessions at a time, on a timer, so nothing waits on a long backfill.
async function drain($: EngineInterface) {
  if (isDraining) return
  isDraining = true
  try {
    const s = await getSettings($)
    const now = ((await $.store.get('queue')) as string[] | undefined) ?? []
    if (!s || now.length === 0 || !(await folderIsThere($, s))) return
    const batch = now.slice(0, 3)
    for (const path of batch) {
      const id = path.split(/[\\/]/).pop()!.replace(/\.jsonl$/, '')
      await copy($, path, id, { isCurrent: false, isFinal: true }).catch(() => {})
    }
    const after = ((await $.store.get('queue')) as string[] | undefined) ?? []
    const left = after.filter(p => !batch.includes(p))
    await $.store.set('queue', left)
    if (left.length === 0 && now.length > batch.length) $.ui.log('session-archive: caught up, every queued session is archived.')
  } finally {
    isDraining = false
  }
}

// Every transcript Claude Code still has on disk, with its size.
async function onDisk($: EngineInterface) {
  const base = `${await configDir($)}/projects`
  const found: { path: string; size: number }[] = []
  for (const dir of await $.fs.list(base).catch(() => [])) {
    if (dir.kind !== 'dir') continue
    for (const f of await $.fs.list(`${base}/${dir.name}`).catch(() => []))
      if (f.kind === 'file' && f.name.endsWith('.jsonl')) found.push({ path: `${base}/${dir.name}/${f.name}`, size: f.size })
  }
  return found
}

const mb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

async function backfill($: EngineInterface) {
  const s = await getSettings($)
  if (!s) return 'Set up first: /sessions setup.'
  const known = Object.values(await readOwn($, s))
  const todo = (await onDisk($)).filter(f => !known.some(e => e.source.replace(/\\/g, '/') === f.path && e.size === f.size))
  if (todo.length === 0) return 'Every session still on disk is already archived.'
  await queue($, todo.map(f => f.path))
  return `Archiving ${todo.length} session${todo.length === 1 ? '' : 's'} (${mb(todo.reduce((n, f) => n + f.size, 0))}) in the background. You'll see a line when it's done.`
}

// Sessions from the last two weeks whose transcript changed after its last copy (a session that ended before its
// final copy finished, say) are copied again.
async function catchUp($: EngineInterface) {
  const s = await getSettings($)
  if (!s) return
  const cutoff = (await $.clock.now()) - 14 * 86_400_000
  const stale: string[] = []
  for (const e of Object.values(await readOwn($, s))) {
    if (e.ended < cutoff) continue
    const stat = await $.fs.stat(e.source).catch(() => undefined)
    if (stat && stat.size !== e.size) stale.push(e.source)
  }
  if (stale.length) await queue($, stale)
}

async function cleanupLine($: EngineInterface, s: Settings) {
  const days = await $.settings.read({ key: 'cleanupPeriodDays' }).catch(() => undefined)
  if (days !== undefined && days !== 30) return ''
  if (!s.folder)
    return '\n\nImportant: Claude Code deletes transcripts after 30 days, and with them left in place the archive loses them too. Set "cleanupPeriodDays" in ~/.claude/settings.json (say 3650) to keep them longer. This mod never changes your settings.'
  return '\n\nClaude Code deletes its own transcripts after 30 days ("cleanupPeriodDays" in ~/.claude/settings.json). Your archive keeps its copies either way.'
}

// Asked once: where to keep copies, which format, how to search, and whether to copy what's on disk now.
async function setup($: EngineInterface) {
  await $.store.set('asked', true)
  const where = await $.ui.ask(
    'Where should session-archive keep a copy of each session? Tip: a folder inside OneDrive or Dropbox is a free backup, and lets several PCs share one archive. Type a path under Other for your own folder.',
    { header: 'Archive', options: [NEW_FOLDER, IN_PLACE] },
  )
  let folder: string | null = null
  if (where === NEW_FOLDER) folder = `${await home($)}/claude-sessions`
  else if (where !== IN_PLACE) folder = where.trim().replace(/^~(?=$|[\\/])/, await home($)).replace(/\\/g, '/').replace(/\/+$/, '')
  let format: Settings['format'] = 'raw'
  if (folder) {
    const picked = await $.ui.ask('Which format should the copies be in? Raw is exact and can be resumed; Markdown is readable.', {
      header: 'Format',
      options: Object.keys(FORMATS),
    })
    format = FORMATS[picked as keyof typeof FORMATS] ?? 'both'
  }
  const how = await $.ui.ask('How should /sessions search find things?', { header: 'Search', options: [MEANING, PLAIN] })
  const s: Settings = { folder, format, mode: how === PLAIN ? 'plain' : 'meaning' }
  await $.store.set('settings', s)
  if (folder) await $.fs.write(`${folder}/README.txt`, 'Copies of Claude Code sessions, kept by the session-archive mod. index-<pc>.json lists them.\n')
  const there = await onDisk($)
  let note = ''
  if (there.length > 0) {
    const size = mb(there.reduce((n, f) => n + f.size, 0))
    const verb = folder ? 'Copy' : 'Index'
    const now = await $.ui.ask(
      `${verb} the ${there.length} session${there.length === 1 ? '' : 's'} (${size}) still on disk now? Claude Code deletes them after 30 days otherwise.`,
      { header: 'Backfill', options: [COPY_NOW, NOT_NOW] },
    )
    note = now === COPY_NOW ? `\n${await backfill($)}` : '\n/sessions backfill copies them later.'
  }
  const place = folder ? `Copies go to ${folder}.` : 'Sessions stay where Claude Code keeps them; the mod indexes them.'
  $.ui.log(`session-archive is set up. ${place}${note}${await cleanupLine($, s)}\n/sessions shows everything it can do.`)
}

const ago = (ms: number, now: number) => {
  const days = Math.floor((now - ms) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

// A line of the copy around the first word that matches, for a search result.
const snippet = (text: string, words: string[]) => {
  const low = text.toLowerCase()
  const at = Math.min(...words.map(w => low.indexOf(w)).filter(i => i >= 0))
  if (!Number.isFinite(at)) return ''
  const from = Math.max(0, at - 60)
  return `${from > 0 ? '…' : ''}${text.slice(from, at + 100).replace(/\s+/g, ' ').trim()}…`
}

async function textOf($: EngineInterface, e: Entry) {
  for (const path of e.file ? [`${e.file}.md`, `${e.file}.jsonl`, e.source] : [e.source]) {
    const stat = await $.fs.stat(path).catch(() => undefined)
    if (stat?.kind === 'file' && stat.size <= MAX_READ) return $.fs.read(path).catch(() => '')
  }
  return ''
}

async function search($: EngineInterface, args: string) {
  const s = await getSettings($)
  if (!s) return 'Set up first: /sessions setup.'
  let rest = args
  const here = /(^|\s)--here(\s|$)/.test(rest)
  const plain = /(^|\s)--plain(\s|$)/.test(rest) || s.mode === 'plain'
  rest = rest.replace(/(^|\s)--(here|plain)(?=\s|$)/g, ' ').trim()
  if (!rest) return 'Usage: /sessions search [--here] [--plain] <words>'
  const root = (await $.session.root()).replace(/\\/g, '/').toLowerCase()
  const all = (await readAll($, s)).filter(e => !here || e.root.replace(/\\/g, '/').toLowerCase() === root)
  if (all.length === 0) return 'Nothing archived yet.'
  const words = rest.toLowerCase().split(/\s+/).filter(Boolean)
  let hits: { e: Entry; snip: string }[] = []
  if (plain) {
    for (const e of all.slice(0, MAX_PLAIN)) {
      const about = `${e.title} ${e.summary} ${e.keywords.join(' ')} ${e.project}`
      const body = words.every(w => about.toLowerCase().includes(w)) ? about : await textOf($, e)
      if (words.every(w => body.toLowerCase().includes(w))) hits.push({ e, snip: snippet(body, words) })
      if (hits.length >= 10) break
    }
  } else {
    const some = all.slice(0, MAX_MEANING)
    const list = some.map((e, i) => `${i + 1}. ${dayOf(e.ended)} | ${e.project} | ${e.title} | ${e.summary} | ${e.keywords.join(', ')}`).join('\n')
    const r = await $.model.complete({
      model: 'haiku',
      maxTokens: 200,
      system: 'You find past coding sessions in an archive. Reply with JSON only.',
      prompt: `Which of these sessions best match the search "${rest}"? Up to 8, best first, as a JSON array of their numbers, [] if none fit.\n\n${list}`,
    })
    if (!r.isAnswered) return `Search by meaning didn't answer (${r.reason}). Try /sessions search --plain ${rest}`
    let picks: number[] = []
    try {
      picks = JSON.parse(r.text.slice(r.text.indexOf('['), r.text.lastIndexOf(']') + 1)) as number[]
    } catch {}
    for (const n of picks) {
      const e = some[Number(n) - 1]
      if (!e || hits.some(x => x.e.id === e.id)) continue
      const body = await textOf($, e)
      hits.push({ e, snip: snippet(body, words) || e.summary })
    }
  }
  if (hits.length === 0) return `No archived session matches "${rest}".${plain ? '' : ' Try --plain for exact words.'}`
  const now = await $.clock.now()
  const out: string[] = []
  for (const [i, { e, snip }] of hits.entries()) {
    const isThere = (await $.fs.stat(e.source).catch(() => undefined))?.kind === 'file'
    const reopen = isThere
      ? `claude --resume ${e.id}`
      : e.file && s.format !== 'md'
        ? `original deleted; copy ${e.file}.jsonl back to ${e.source}, then: claude --resume ${e.id}`
        : `original deleted; read ${e.file ? `${e.file}.md` : 'nothing kept'}`
    out.push(`${i + 1}. ${e.title} · ${e.project} · ${ago(e.ended, now)}${snip ? `\n   ${snip}` : ''}\n   ${reopen}`)
  }
  return out.join('\n')
}

const HELP = (s: Settings | undefined, isOff: boolean) =>
  [
    s
      ? `session-archive: copies go to ${s.folder ?? 'nowhere (left where Claude Code keeps them, indexed only)'}, format ${s.format}, search by ${s.mode}${isOff ? '. Off in this project.' : '.'}`
      : 'session-archive is not set up yet: /sessions setup.',
    '/sessions search [--here] [--plain] <words>   find a past session',
    '/sessions stats                               usage stats pane',
    '/sessions folder <path>                       change where copies go',
    '/sessions off | on                            stop or restart archiving this project',
    '/sessions format raw | md | both              format of new copies',
    '/sessions mode meaning | plain                default search',
    '/sessions backfill                            archive what is still on disk',
    '/sessions setup                               ask the setup questions again',
  ].join('\n')

async function command($: EngineInterface, args: string) {
  const [word = '', ...more] = args.trim().split(/\s+/)
  const rest = more.join(' ').trim()
  const s = await getSettings($)
  const root = await $.session.root()
  switch (word.toLowerCase()) {
    case '':
    case 'help':
      return HELP(s, Boolean(await $.store.get(offKey(root))))
    case 'search':
      return search($, rest)
    case 'stats':
      await $.ui.open({ id: PANE, title: 'Session stats', focus: true, closeOnEscape: true })
      return 'Stats pane opened.'
    case 'backfill':
      return backfill($)
    case 'setup':
      void setup($).catch(() => {})
      return 'Asking the setup questions.'
    case 'off':
      await $.store.set(offKey(root), true)
      return `Archiving is off for ${projectOf(root)}. Copies already made stay in ${s?.folder ? `${s.folder}/${safe(projectOf(root))}` : 'place'}; delete that folder yourself if you want them gone. /sessions on restarts it.`
    case 'on':
      await $.store.delete(offKey(root))
      return `Archiving is on for ${projectOf(root)}.`
    case 'folder': {
      if (!s) return 'Set up first: /sessions setup.'
      if (!rest) return `Copies go to ${s.folder ?? 'nowhere (left in place)'}. /sessions folder <path> changes it.`
      const folder = rest.replace(/^["']|["']$/g, '').replace(/^~(?=$|[\\/])/, await home($)).replace(/\\/g, '/').replace(/\/+$/, '')
      // The index moves with the folder; old copies stay where they are.
      const own = await readOwn($, s)
      const next: Settings = { ...s, folder }
      await $.store.set('settings', next)
      await writeOwn($, next, own)
      return `New copies go to ${folder}. Copies already made stay in ${s.folder ?? 'place'}; move them yourself if you want them together.`
    }
    case 'format': {
      if (!s) return 'Set up first: /sessions setup.'
      const formats: Record<string, Settings['format']> = { raw: 'raw', md: 'md', markdown: 'md', both: 'both' }
      const f = formats[rest.toLowerCase()]
      if (!f) return 'Usage: /sessions format raw | md | both'
      await $.store.set('settings', { ...s, format: f })
      return `New copies are ${f === 'md' ? 'Markdown' : f === 'raw' ? 'raw transcripts' : 'both raw and Markdown'}.`
    }
    case 'mode': {
      if (!s) return 'Set up first: /sessions setup.'
      const m = rest.toLowerCase()
      if (m !== 'meaning' && m !== 'plain') return 'Usage: /sessions mode meaning | plain'
      await $.store.set('settings', { ...s, mode: m })
      return m === 'meaning' ? 'Searches go by meaning (a few tokens each).' : 'Searches match plain words (free).'
    }
    default:
      return `Unknown: /sessions ${word}\n\n${HELP(s, false)}`
  }
}

// The entries the pane draws from, read at most every few seconds.
let cached: { at: number; entries: Entry[] } | undefined
async function entries($: EngineInterface) {
  const now = await $.clock.now()
  if (cached && now - cached.at < 10_000) return cached.entries
  const s = await getSettings($)
  cached = { at: now, entries: s ? await readAll($, s) : [] }
  return cached.entries
}

const money = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)
const count = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n))
const LEVELS = ['subtle', 'diffAddedDimmed', 'diffAdded', 'success'] as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sessions',
      description: 'Search, reopen and see stats for every archived Claude Code session',
      argumentHint: '[search <words> | stats | folder <path> | off | on | format | mode | backfill | setup]',
    })
    const started = await next(e)
    $.clock.every(5000, () => void drain($).catch(() => {}))
    if (e.isInteractive && !(await $.store.get('asked'))) void setup($).catch(() => {})
    void catchUp($).catch(() => {})
    return started
  })

  // After each of Claude's turns: copy this session, at most every few minutes.
  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    if (!e.agent_id) {
      const at = await $.clock.now()
      if (at - (lastCopy.get(e.session_id) ?? 0) >= COPY_EVERY) {
        lastCopy.set(e.session_id, at)
        void copy($, e.transcript_path, e.session_id, { isCurrent: true, isFinal: false }).catch(() => {})
      }
    }
    return result
  })

  // Keeps counting a session too big to read (over 4 MiB) from each turn's own usage.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId && e.usage) {
      const day = (since[dayOf(await $.clock.now())] ??= { messages: 0, tokens: {} })
      day.messages++
      const { model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens } = e.usage
      day.tokens[model] = add(day.tokens[model] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, {
        input: input_tokens,
        output: output_tokens,
        cacheRead: cache_read_input_tokens ?? 0,
        cacheWrite: cache_creation_input_tokens ?? 0,
      })
    }
    return done
  })

  // The final copy, covering the whole session. Exits are kept short: what doesn't finish here is copied again
  // at the next session start (catchUp).
  on('classic.SessionEnd', async ($, e, next) => {
    const result = await next(e)
    await copy($, e.transcript_path, e.session_id, { isCurrent: true, isFinal: true }).catch(() => {})
    return result
  })

  // Puts the archive title in Claude Code's own session list (/resume, the desktop sidebar), so a /clear doesn't
  // keep the old name. Set with the next prompt after the title is written.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    const result = await next(e)
    const s = await getSettings($)
    if (!s || result.sessionTitle) return result
    const title = (await readOwn($, s))[e.session_id]?.title
    if (!title || (await $.store.get(`named:${e.session_id}`)) === title) return result
    await $.store.set(`named:${e.session_id}`, title)
    return { ...result, sessionTitle: title }
  })

  on('command.run', { command: 'sessions' }, async ($, e) => ({ text: await command($, e.args) }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const r = await read($, range)
    const here = await read($, isHere)
    const root = (await $.session.root()).replace(/\\/g, '/').toLowerCase()
    const today = dayOf(await $.clock.now())
    const from = r === 'all' ? '' : [...Array(Number(r) - 1)].reduce<string>(d => prevDay(d), today)
    const all = (await entries($)).filter(x => !here || x.root.replace(/\\/g, '/').toLowerCase() === root)
    const st = stats(all, from, today)
    const set = (fn: () => Promise<unknown>) => () => void fn().catch(() => {})
    const width = e.props.bodyColumns
    // The heatmap: one column per week, Monday at the top, as many weeks as fit (up to a year).
    const weeks = Math.max(4, Math.min(52, Math.floor((width - 4) / 2)))
    const busiest = Math.max(1, ...[...st.byDay.values()].map(v => v.messages))
    const start = (() => {
      let d = today
      while (new Date(`${d}T12:00`).getDay() !== 1) d = prevDay(d)
      for (let i = 0; i < weeks - 1; i++) for (let j = 0; j < 7; j++) d = prevDay(d)
      return d
    })()
    const grid: string[][] = []
    for (let w = 0, d = start; w < weeks; w++)
      for (let wd = 0; wd < 7; wd++, d = nextDay(d)) (grid[wd] ??= []).push(d)
    const level = (d: string) => {
      const n = st.byDay.get(d)?.messages ?? 0
      return d > today ? -1 : n === 0 ? 0 : Math.min(3, Math.ceil((n / busiest) * 3))
    }
    const models = Object.entries(st.perModel).sort((a, b) => total(b[1]) - total(a[1])).slice(0, 5)
    const projects = Object.entries(st.perProject).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const tab = (label: string, isOn: boolean, onPress: () => void) => (
      <Button key={label} plain label={isOn ? `[${label}]` : ` ${label} `} onPress={onPress} />
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {tab('All time', r === 'all', set(() => update($, range, () => 'all')))}
          {tab('30 days', r === '30', set(() => update($, range, () => '30')))}
          {tab('7 days', r === '7', set(() => update($, range, () => '7')))}
          <Text> · </Text>
          {tab(here ? 'This project' : 'All projects', true, set(() => update($, isHere, v => !v)))}
        </Box>
        {all.length === 0 ? (
          <Text dimColor>Nothing archived yet. Sessions are copied as you work; /sessions backfill adds the ones still on disk.</Text>
        ) : (
          <Box flexDirection="column">
            <Text> </Text>
            <Text>
              <Text bold>{st.sessions}</Text> sessions · <Text bold>{count(st.messages)}</Text> messages · <Text bold>{count(st.tokens)}</Text> tokens
            </Text>
            <Text>
              <Text bold>{st.activeDays}</Text> active days · streak <Text bold>{st.current}</Text> (longest {st.longest})
              {st.peak !== undefined ? ` · peak hour ${pad2(st.peak)}:00` : ''}
            </Text>
            {st.favourite && <Text>Favourite model: {st.favourite}</Text>}
            <Text> </Text>
            {grid.map(row => (
              <Text>
                {row.map(d => {
                  const l = level(d)
                  return l < 0 ? '  ' : <Text color={LEVELS[l]}>{l === 0 ? '· ' : '■ '}</Text>
                })}
              </Text>
            ))}
            <Text dimColor>{weeks} weeks, Monday at the top</Text>
            <Text> </Text>
            <Text bold>Tokens by model</Text>
            {models.map(([m, t]) => (
              <Text>
                {m}: {count(total(t))}
                <Text dimColor>
                  {' '}
                  (in {count(t.input)}, out {count(t.output)}, cache {count(t.cacheRead + t.cacheWrite)})
                </Text>
              </Text>
            ))}
            <Text> </Text>
            <Text bold>Cost ≈ at API prices</Text>
            <Text>
              Today {money(st.today)} · this month {money(st.month)} · {r === 'all' ? 'all time' : `last ${r} days`} {money(st.all)}
            </Text>
            {projects.filter(([, c]) => c > 0).map(([p, c]) => (
              <Text dimColor>
                {'  '}
                {p}: {money(c)}
              </Text>
            ))}
            <Text dimColor>
              Subscribers don't pay this; it's a sense of scale. Prices as of {PRICES_DATE}.
              {st.unpriced > 0 ? ` ${count(st.unpriced)} tokens on models without a price aren't counted.` : ''}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}

const pad2 = (n: number) => String(n).padStart(2, '0')
