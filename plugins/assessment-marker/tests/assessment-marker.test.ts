import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

import { CHAT_ONLY, DEFAULT_SAVE, SAVE_NOTE, SAVE_OPTIONS, SAVE_QUESTION, USAGE, parseSave, subjectName } from '../hooks/register'

const SUBJECT = 'C:/uni/31250 IDA'
const SUBJECT_FILE = `${SUBJECT}/.assessment-marker/subject.json`

// `answer` is what the person picks or types; null closes the question. `files` maps paths to contents, and can
// change mid-test like the setup skill writing subject.json.
type World = { answer: string | null; files?: Record<string, string>; saved?: Record<string, unknown>; submitFails?: boolean }
type Seen = { asked: { question: string; options: string[] }[]; submitted: string[]; logs: string[]; toasts: string[]; store: Record<string, unknown> }

let clock: MockClock

// Stands in for the engine beneath the plugin.
function engine(on: On, world: World): Seen {
  const seen: Seen = { asked: [], submitted: [], logs: [], toasts: [], store: { ...(world.saved ?? {}) } }
  clock = mock.clock(on)
  // A store the test can read back.
  on('store.get', ($, e) => ({ value: seen.store[e.key] }))
  on('store.set', ($, e) => {
    seen.store[e.key] = e.value
    return { value: undefined }
  })
  const files = () => world.files ?? {}
  // The engine hands paths on in the platform's own separators.
  const find = (path: string) => files()[path.replace(/\\/g, '/')]
  on('fs.stat', ($, e) => {
    const text = find(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: { kind: 'file' as const, size: text.length, mtimeMs: 1, isLink: false } }
  })
  on('fs.read', ($, e) => {
    const text = find(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('session.id', () => ({ value: 's1' }))
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = e.questions[0]!
    seen.asked.push({ question: q.question, options: q.options.map(o => o.label) })
    if (world.answer === null) return { deny: 'The user dismissed the question.' }
    return { result: { questions: e.questions, answers: { [q.question]: world.answer } } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', ($, e) => {
    seen.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => {
    if (world.submitFails) throw new Error('busy')
    seen.submitted.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  return seen
}

const start = async ($: Engine, cwd = 'C:/proj', isInteractive = true) => {
  await $.session.start({ cwd, surface: 'terminal', isInteractive })
  await clock.advance(2000)
  await clock.settle()
}
const run = async ($: Engine, args: string) => {
  const r = await $.command.run({ command: 'mark', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await clock.settle()
  return r
}
const COMPOSE = { model: 'test', promptModel: 'test', surfaces: ['terminal' as const], tools: [], outputStyle: null, traits: [] }
const guide = async ($: Engine) => (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'assessment-marker:guide')?.text ?? ''

test('first session asks once where reviews go', async ($, on) => {
  const seen = engine(on, { answer: SAVE_OPTIONS[1] })
  await start($)
  expect(seen.asked).toEqual([{ question: SAVE_QUESTION, options: [...SAVE_OPTIONS] }])
  expect(seen.store.saveTo).toBe(CHAT_ONLY)
  expect(seen.logs).toEqual([SAVE_NOTE(CHAT_ONLY)])
  await start($)
  expect(seen.asked.length).toBe(1)
})

test('closing the question keeps the default folder and is not asked again', async ($, on) => {
  const seen = engine(on, { answer: null })
  await start($)
  expect(seen.store.saveTo).toBe(DEFAULT_SAVE)
  await start($)
  expect(seen.asked.length).toBe(1)
})

test('no question under -p', async ($, on) => {
  const seen = engine(on, { answer: SAVE_OPTIONS[0] })
  await start($, 'C:/proj', false)
  expect(seen.asked).toEqual([])
})

test('parseSave maps the options and keeps typed text', () => {
  expect(parseSave(SAVE_OPTIONS[0])).toBe(DEFAULT_SAVE)
  expect(parseSave(SAVE_OPTIONS[1])).toBe(CHAT_ONLY)
  expect(parseSave('')).toBe(DEFAULT_SAVE)
  expect(parseSave('reviews/marking')).toBe('reviews/marking')
})

test('a session inside a subject folder names that subject and seals it off', async ($, on) => {
  const seen = engine(on, { answer: null, files: { [SUBJECT_FILE]: '{"name": "31250 Introduction to Data Analytics"}' } })
  await start($, `${SUBJECT}\\A2\\drafts`)
  const text = await guide($)
  expect(text).toMatch(/Active subject: 31250 Introduction to Data Analytics, folder `C:\/uni\/31250 IDA`/)
  expect(text).toMatch(/Never read another subject/)
  expect(seen.store.subjects).toEqual([{ name: '31250 Introduction to Data Analytics', path: SUBJECT }])
})

test('outside any subject the guide lists the known ones', async ($, on) => {
  engine(on, { answer: null, saved: { firstRun: 'done', subjects: [{ name: '32146 DV', path: 'C:/uni/DV' }] } })
  await start($, 'C:/proj')
  const text = await guide($)
  expect(text).toMatch(/isn't inside a set-up subject folder/)
  expect(text).toMatch(/32146 DV \(`C:\/uni\/DV`\)/)
  expect(text).toMatch(/New subject/)
})

test('a subject set up mid-session shows on the next request', async ($, on) => {
  const world: World = { answer: null, saved: { firstRun: 'done' } }
  engine(on, world)
  await start($, SUBJECT)
  expect(await guide($)).toMatch(/No subjects are set up yet/)
  world.files = { [SUBJECT_FILE]: '{"name": "31250 IDA"}' }
  expect(await guide($)).toMatch(/Active subject: 31250 IDA/)
})

test('the guide carries the save choice, the HD bar and the tight trigger', async ($, on) => {
  engine(on, { answer: null, saved: { firstRun: 'done', saveTo: CHAT_ONLY } })
  await start($)
  const text = await guide($)
  expect(text).toMatch(/in the chat only/)
  expect(text).toMatch(/High Distinction \(85\+\)/)
  expect(text).toMatch(/Answer smaller questions about the work normally/)
  expect(text).toMatch(/don't ask permission first/)
})

test('subjectName falls back to the folder name', () => {
  expect(subjectName('{"name": " 31265 CITP "}', 'C:/uni/x')).toBe('31265 CITP')
  expect(subjectName('not json', 'C:/uni/31265 CITP')).toBe('31265 CITP')
  expect(subjectName('{}', 'C:/uni/TD')).toBe('TD')
})

test('/mark routes each stage to its skill', async ($, on) => {
  const seen = engine(on, { answer: null, saved: { firstRun: 'done' } })
  await start($)
  await run($, '')
  await run($, 'ready')
  await run($, 'Setup')
  expect(seen.submitted[0]).toMatch(/assessment-marker:mark skill/)
  expect(seen.submitted[1]).toMatch(/assessment-marker:ready skill/)
  expect(seen.submitted[2]).toMatch(/assessment-marker:setup skill/)
})

test('anything other than ready or setup shows the usage line', async ($, on) => {
  const seen = engine(on, { answer: null, saved: { firstRun: 'done' } })
  await start($)
  expect((await run($, 'save')).text).toBe(USAGE)
  expect((await run($, 'now please')).text).toBe(USAGE)
  expect(seen.submitted).toEqual([])
})

test('a /mark that fails to submit says what to do instead', async ($, on) => {
  const seen = engine(on, { answer: null, saved: { firstRun: 'done' }, submitFails: true })
  await start($)
  await run($, '')
  expect(seen.toasts.length).toBe(1)
  expect(seen.toasts[0]).toMatch(/grade it now/)
})
