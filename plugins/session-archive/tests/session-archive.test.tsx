import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

import { cost, lines, markdown, parse, stats } from '../hooks/archive'
import type { Entry } from '../types'

const SRC = 'C:/Users/me/.claude/projects/C--proj/abc12345-0000.jsonl'
const ARCHIVE = 'C:/Users/me/claude-sessions'
const SETTINGS = { folder: ARCHIVE, format: 'both', mode: 'meaning' }

const row = (o: Record<string, unknown>) => JSON.stringify({ sessionId: 'abc12345-0000', cwd: 'C:\\proj', ...o })
const user = (text: string, ts: string) => row({ type: 'user', timestamp: ts, message: { role: 'user', content: text } })
const reply = (text: string, ts: string, id: string, extra: unknown[] = []) =>
  row({
    type: 'assistant',
    timestamp: ts,
    message: {
      id,
      role: 'assistant',
      model: 'claude-opus-5-5',
      content: [{ type: 'text', text }, ...extra],
      usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  })

// A small file system in memory, standing in for the disk beneath the plugin.
function disk(on: On, files: Map<string, string>) {
  const norm = (p: string) => p.replace(/\\/g, '/')
  on('fs.read', ($, e) => {
    const text = files.get(norm(e.path))
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('fs.stat', ($, e) => {
    const p = norm(e.path)
    if (files.has(p)) return { value: { kind: 'file' as const, size: files.get(p)!.length, mtimeMs: 0, isLink: false } }
    if ([...files.keys()].some(k => k.startsWith(`${p}/`))) return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    throw new Error('ENOENT')
  })
  on('fs.list', ($, e) => {
    const p = norm(e.path)
    const names = new Map<string, 'file' | 'dir'>()
    for (const k of files.keys()) {
      if (!k.startsWith(`${p}/`)) continue
      const [name, ...more] = k.slice(p.length + 1).split('/')
      names.set(name!, more.length ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: kind === 'file' ? files.get(`${p}/${name}`)!.length : 0, mtimeMs: 0, isLink: false })) }
  })
}

type World = { files: Map<string, string>; clock: MockClock; titles: string[] }

function engine(on: On, store: Record<string, unknown> = { asked: true, settings: SETTINGS }): World {
  const files = new Map<string, string>([[`${ARCHIVE}/README.txt`, ''], [SRC, [user('Speed up the order book', '2026-10-30T01:00:00Z'), reply('Sure.', '2026-10-30T01:00:05Z', 'm1')].join('\n')]])
  const clock = mock.clock(on, { now: Date.parse('2026-10-30T02:00:00Z') })
  const titles: string[] = []
  mock.store(on, store)
  mock.env(on, { USERPROFILE: 'C:\\Users\\me', COMPUTERNAME: 'DESK' })
  disk(on, files)
  on('session.root', () => ({ value: 'C:\\proj' }))
  on('session.id', () => ({ value: 'abc12345-0000' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.Stop', () => ({}))
  on('classic.SessionEnd', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('model.complete', ($, e) => {
    titles.push(e.prompt)
    const usage = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    if (e.prompt.includes('best match')) return { value: { isAnswered: true as const, text: '[1]', usage } }
    return { value: { isAnswered: true as const, text: '{"title": "Order book speedup", "summary": "Made it faster.", "keywords": ["c++"]}', usage } }
  })
  return { files, clock, titles }
}

const start = ($: Engine) => $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
const stop = ($: Engine) => $.classic.Stop({ stop_hook_active: false, session_id: 'abc12345-0000', transcript_path: SRC, cwd: 'C:\\proj' })
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'sessions', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
const archived = (w: World) => [...w.files.keys()].filter(k => k.startsWith(`${ARCHIVE}/proj/`))

test('parse counts typed messages and each response once', async () => {
  const p = parse(lines([user('hi', '2026-10-30T01:00:00Z'), reply('a', '2026-10-30T01:00:01Z', 'm1'), reply('b', '2026-10-30T01:00:02Z', 'm1')].join('\n')), 'x')
  expect(p.messages).toBe(1)
  const day = Object.values(p.days)[0]!
  expect(day.tokens['claude-opus-5-5']?.input).toBe(1000)
})

test('the Markdown copy keeps tool output, folded when long, and leaves thinking out', async () => {
  const call = { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }
  const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const md = markdown(
    lines(
      [
        user('run the tests', '2026-10-30T01:00:00Z'),
        reply('Running.', '2026-10-30T01:00:01Z', 'm1', [call, { type: 'thinking', thinking: 'secret plan' }]),
        row({ type: 'user', timestamp: '2026-10-30T01:00:02Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: long }] } }),
      ].join('\n'),
    ),
    'Tests',
    'abc',
  )
  expect(md).toContain('**Bash** `npm test`')
  expect(md).toContain('<summary>Output (30 lines)</summary>')
  expect(md).toContain('line 29')
  expect(md).not.toContain('secret plan')
})

test('cost uses the price table, and an unknown model has none', async () => {
  expect(cost('claude-opus-5-5', { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 })).toBe(24)
  expect(cost('some-other-model', { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 })).toBeUndefined()
})

test('a streak counts every day with a message', async () => {
  const day = (messages: number) => ({ messages, tokens: {} })
  const e = { project: 'p', hours: new Array(24).fill(0), days: { '2026-10-28': day(1), '2026-10-29': day(2), '2026-10-30': day(1), '2026-10-25': day(1) } } as unknown as Entry
  const st = stats([e], '', '2026-10-30')
  expect(st.current).toBe(3)
  expect(st.longest).toBe(3)
  expect(st.activeDays).toBe(4)
})

test('a turn copies the session into the archive with a title, raw and Markdown', async ($, on) => {
  const w = engine(on)
  await start($)
  await stop($)
  await w.clock.settle()
  const copies = archived(w)
  expect(copies.length).toBe(2)
  expect(copies.some(k => k.endsWith('Order book speedup abc12345.jsonl'))).toBe(true)
  expect(copies.some(k => k.endsWith('.md'))).toBe(true)
  const index = JSON.parse(w.files.get(`${ARCHIVE}/index-desk.json`)!) as Record<string, Entry>
  expect(index['abc12345-0000']?.title).toBe('Order book speedup')
})

test('later copies overwrite the same files, so the archive holds one copy per session', async ($, on) => {
  const w = engine(on)
  await start($)
  await stop($)
  await w.clock.settle()
  w.files.set(SRC, `${w.files.get(SRC)}\n${user('now the tests', '2026-10-30T01:10:00Z')}`)
  await w.clock.advance(4 * 60_000)
  await stop($)
  await w.clock.settle()
  await $.classic.SessionEnd({ reason: 'prompt_input_exit', session_id: 'abc12345-0000', transcript_path: SRC, cwd: 'C:\\proj' })
  await w.clock.settle()
  const copies = archived(w)
  expect(copies.length).toBe(2)
  expect(w.files.get(copies.find(k => k.endsWith('.jsonl'))!)).toContain('now the tests')
})

test('the title goes into Claude Code\'s own session list once', async ($, on) => {
  const w = engine(on)
  await start($)
  await stop($)
  await w.clock.settle()
  const first = await $.classic.UserPromptSubmit({ prompt: 'next', session_id: 'abc12345-0000', transcript_path: SRC, cwd: 'C:\\proj' })
  expect(first.sessionTitle).toBe('Order book speedup')
  const second = await $.classic.UserPromptSubmit({ prompt: 'again', session_id: 'abc12345-0000', transcript_path: SRC, cwd: 'C:\\proj' })
  expect(second.sessionTitle).toBeUndefined()
})

test('/sessions off stops archiving this project', async ($, on) => {
  const w = engine(on)
  await start($)
  expect((await run($, 'off')).text).toContain('off for proj')
  await stop($)
  await w.clock.settle()
  expect(archived(w).length).toBe(0)
})

test('a missing archive folder queues the session and copies it once the folder is back', async ($, on) => {
  const w = engine(on, { asked: true, settings: { ...SETTINGS, folder: 'D:/gone' } })
  await start($)
  await stop($)
  await w.clock.settle()
  expect([...w.files.keys()].some(k => k.startsWith('D:/gone/'))).toBe(false)
  w.files.set('D:/gone/README.txt', '')
  await w.clock.advance(6000)
  await w.clock.settle()
  expect([...w.files.keys()].some(k => k.startsWith('D:/gone/proj/'))).toBe(true)
})

test('search by meaning finds the session and says how to reopen it', async ($, on) => {
  const w = engine(on)
  await start($)
  await stop($)
  await w.clock.settle()
  const out = (await run($, 'search making the order book faster')).text ?? ''
  expect(out).toContain('Order book speedup')
  expect(out).toContain('claude --resume abc12345-0000')
})

test('plain search matches the words in the copies', async ($, on) => {
  const w = engine(on)
  await start($)
  await stop($)
  await w.clock.settle()
  expect((await run($, 'search --plain speed up')).text).toContain('Order book speedup')
  expect((await run($, 'search --plain nothing-like-this')).text).toContain('No archived session')
})

const PANE = {
  plugin: 'session-archive',
  component: 'Pane',
  requestId: 'session-stats',
  props: { title: 'Session stats', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

test('the stats pane draws totals, the heatmap and cost on the terminal and desktop', async ($, on) => {
  const w = engine(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await start($)
  await stop($)
  await w.clock.settle()
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /1 sessions · 1 messages/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Today \$0\.01/ })).toBeDefined()
    await ui.press({ key: '7 days' })
    expect(await ui.find({ type: 'Text', text: /last 7 days/ })).toBeDefined()
    await ui.unmount()
  }
})
