import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { banned, commentRate, errorKey, languageOf, verifies } from '../hooks/checks'

type World = { submitted: string[]; asked: string[]; toasts: string[]; classified: string[]; claims: boolean; contexts: (readonly string[])[] }

// Stands in for the engine beneath the plugin. `bash` answers each command; the project has a tests folder.
function engine(on: On, settings: Record<string, unknown>, bash: (command: string) => { text: string; isError?: true } = () => ({ text: 'ok' })): World {
  const w: World = { submitted: [], asked: [], toasts: [], classified: [], claims: true, contexts: [] }
  mock.store(on, { asked: true, settings: { loop: true, done: true, style: true, isLoud: false, threshold: 1, fix: 'headsup', unbanned: [], bans: [], ...settings } })
  on('session.root', () => ({ value: 'C:/proj' }))
  on('fs.list', ($, e) => ({ value: /^C:[\\/]proj$/.test(e.path) ? [{ name: 'tests', kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false }] : [] }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.toast', ($, e) => {
    w.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('model.classify', ($, e) => {
    w.classified.push(e.text)
    return { value: w.claims ? e.labels[0] : e.labels[1] }
  })
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') w.submitted.push(e.text)
    else w.contexts.push(e.context ?? [])
    return { text: e.text, context: e.context }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    const r = bash(e.command)
    return { result: { stdout: r.text, stderr: '', interrupted: false }, text: r.text, ...(r.isError && { isError: r.isError }) }
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: {}, text: 'edited' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return w
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  for (let i = 0; i < 20; i++) await new Promise<void>(done => setTimeout(done, 0))
}
declare const setTimeout: (done: () => void, ms: number) => unknown
const bash = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command })
const edit = ($: Engine, old_string = 'a', new_string = 'b') => $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string, new_string })
const answer = ($: Engine, text: string) => $.turn.complete({ answer: text, durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
const type = ($: Engine, text: string) => $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false })
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'coach', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

test('an error key ignores line numbers and paths', async () => {
  const a = errorKey('Compiling...\nsrc/book.cpp:42:7: error: no member named \'push\' in Order')
  const b = errorKey('Compiling...\nsrc/book.cpp:57:3: error: no member named \'push\' in Order')
  expect(a).toBe(b)
  expect(errorKey('all good')).toBeUndefined()
})

test('verification, phrases, comments and language', async () => {
  expect(verifies('npm test')).toBe(true)
  expect(verifies('cargo build --release')).toBe(true)
  expect(verifies('git status')).toBe(false)
  expect(verifies('python app.py')).toBe(true)
  expect(verifies("python - <<'EOF'\nopen('x', 'w').write('y')\nEOF")).toBe(false)
  expect(banned("You’re absolutely right, let's go", ["You're absolutely right"])).toEqual(["You're absolutely right"])
  expect(banned('a belt-and-suspenders-ish idea', ['belt-and-suspenders'])).toEqual([])
  expect(commentRate('// a\n// b\nx()\ny()\nz()\nw()')).toBe(5)
  expect(languageOf('This is the reply and it is in English, with the usual words for you to read.')).toBe('english')
  expect(languageOf('Esta es la respuesta y está en español, con las palabras de siempre para que la leas.')).toBe('spanish')
})

test('the same error after a fix adds a loop note to the result, and the tool still runs', async ($, on) => {
  engine(on, {}, () => ({ text: 'src/a.ts:3:1 - error TS2322: Type string is not assignable', isError: true }))
  await start($)
  const first = await bash($, 'npx tsc')
  expect(first.context ?? []).toEqual([])
  await edit($)
  const second = await bash($, 'npx tsc')
  expect(second.text).toContain('error TS2322')
  expect((second.context ?? []).join()).toContain('same error as before your last fix')
})

test('an error with no edit in between is not a loop', async ($, on) => {
  engine(on, {}, () => ({ text: 'Error: boom', isError: true }))
  await start($)
  await bash($, 'node a.js')
  expect((await bash($, 'node a.js')).context ?? []).toEqual([])
})

test('a higher threshold waits for more repeats', async ($, on) => {
  engine(on, { threshold: 2 }, () => ({ text: 'Error: boom', isError: true }))
  await start($)
  await bash($, 'node a.js')
  await edit($)
  expect((await bash($, 'node a.js')).context ?? []).toEqual([])
  await edit($, 'c', 'd')
  expect((await bash($, 'node a.js')).context?.join()).toContain('same error')
})

test('redoing the same edit adds a note', async ($, on) => {
  engine(on, {})
  await start($)
  await edit($)
  await edit($, 'b', 'a')
  expect((await edit($)).context?.join()).toContain('exact edit')
})

test('done without running anything gets one check and a follow-up', async ($, on) => {
  const w = engine(on, {})
  await start($)
  await edit($)
  await answer($, 'Done, the order book now works.')
  expect(w.classified.length).toBe(1)
  expect(w.submitted[0]).toContain('nothing has run since the files changed')
  // Coach's own follow-up turn isn't checked again.
  await $.prompt.submit({ text: w.submitted[0]!, origin: { kind: 'plugin', name: 'coach' }, wait: false })
  await edit($, 'x', 'y')
  await answer($, 'Still done.')
  expect(w.classified.length).toBe(1)
})

test('running the tests after the change means no check', async ($, on) => {
  const w = engine(on, {})
  await start($)
  await edit($)
  await bash($, 'npm test')
  await answer($, 'Done, all tests pass.')
  expect(w.classified.length).toBe(0)
})

test('a style slip in a reply goes in with the next message as a heads-up', async ($, on) => {
  const w = engine(on, { done: false })
  await start($)
  await answer($, "You're absolutely right, I changed it.")
  await type($, 'thanks')
  expect(w.contexts[0]?.join()).toContain('absolutely right')
  await type($, 'and again')
  expect(w.contexts[1] ?? []).toEqual([])
})

test('rewrite mode asks Claude to redo the reply at once', async ($, on) => {
  const w = engine(on, { done: false, fix: 'rewrite' })
  await start($)
  await answer($, 'Belt-and-suspenders: I added both checks.')
  expect(w.submitted[0]).toContain('Write it again')
})

test('a comment-heavy edit gets a note when a limit is set', async ($, on) => {
  engine(on, { comments: 2 })
  await start($)
  const code = '// set up\n// the book\nconst b = book()\n// add\nb.add(1)\nb.run()'
  const r = await $.tool.call({ tool: 'Edit', file_path: 'C:/proj/x.ts', old_string: 'a', new_string: code })
  expect(r.context?.join()).toContain('comment lines per 10 lines')
})

test('notes are toasts too when the person chose to see them', async ($, on) => {
  const w = engine(on, { isLoud: true }, () => ({ text: 'Error: boom', isError: true }))
  await start($)
  await bash($, 'node a.js')
  await edit($)
  await bash($, 'node a.js')
  expect(w.toasts[0]).toContain('same error came back')
})

test('/coach bans and unbans phrases and toggles parts', async ($, on) => {
  engine(on, {})
  await start($)
  expect((await run($, 'ban "load-bearing"')).text).toContain('Banned')
  expect((await run($, 'bans')).text).toContain('load-bearing')
  await run($, 'unban "Great question"')
  expect((await run($, 'bans')).text).not.toContain('Great question')
  expect((await run($, 'style off')).text).toBe('Style guard off.')
  expect((await run($, '')).text).toContain('loop detector, done-check on')
})
