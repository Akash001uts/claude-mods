import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

import { QUESTION, SKIPPED, SOURCES } from '../hooks/register'

const PATH = 'C:/Users/me/.claude/voice/profile.md'
const PROFILE = '# Voice profile\n\n## Email\nSummary: short, "Hi" + first name\n\n## Academic\nSummary: first person, direct'

// What the person ticks; null dismisses the list.
type World = { answer: string | null; profile?: string; saved?: Record<string, unknown> }
type Seen = { asked: { question: string; options: string[]; multiSelect: boolean }[]; submitted: string[]; logs: string[] }

let clock: MockClock

// Stands in for the engine beneath the plugin.
function engine(on: On, world: World): Seen {
  const seen: Seen = { asked: [], submitted: [], logs: [] }
  clock = mock.clock(on)
  mock.store(on, world.saved ?? {})
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  // The engine hands paths on in the platform's own separators.
  const isProfile = (path: string) => world.profile !== undefined && path.replace(/\\/g, '/') === PATH
  on('fs.exists', ($, e) => ({ value: isProfile(e.path) }))
  on('fs.read', ($, e) => {
    if (!isProfile(e.path)) throw new Error('ENOENT')
    return { value: world.profile! }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = e.questions[0]!
    seen.asked.push({ question: q.question, options: q.options.map(o => o.label), multiSelect: q.multiSelect })
    if (world.answer === null) return { deny: 'The user dismissed the question.' }
    return { result: { questions: e.questions, answers: { [q.question]: world.answer } } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', ($, e) => {
    seen.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => {
    seen.submitted.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  return seen
}

const start = async ($: Engine, isInteractive = true) => {
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive })
  await clock.advance(2000)
  await clock.settle()
}
const run = async ($: Engine, args: string) => {
  const r = await $.command.run({ command: 'voice', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await clock.settle()
  return r
}
const COMPOSE = { model: 'test', promptModel: 'test', surfaces: ['terminal' as const], tools: [], outputStyle: null, traits: [] }
const guide = async ($: Engine) => (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'voice:guide')?.text

test('first session asks once with the four sources as a tick-box list', async ($, on) => {
  const seen = engine(on, { answer: null })
  await start($)
  expect(seen.asked).toEqual([{ question: QUESTION, options: [...SOURCES], multiSelect: true }])
  await start($)
  expect(seen.asked.length).toBe(1)
})

test('dismissing the list submits nothing and says how to get it back', async ($, on) => {
  const seen = engine(on, { answer: null })
  await start($)
  expect(seen.submitted).toEqual([])
  expect(seen.logs).toEqual([SKIPPED])
})

test('only the ticked sources go to the setup prompt', async ($, on) => {
  const seen = engine(on, { answer: `${SOURCES[0]}, ${SOURCES[3]}` })
  await start($)
  expect(seen.submitted.length).toBe(1)
  expect(seen.submitted[0]).toMatch(/^Set up my voice profile from: Gmail, Assignments and reports\./)
  expect(seen.submitted[0]).not.toMatch(/Slack|LinkedIn/)
  expect(seen.submitted[0]).toMatch(/voice:setup/)
  expect(seen.submitted[0]).toMatch(PATH)
})

test('no question under -p', async ($, on) => {
  const seen = engine(on, { answer: SOURCES[0] })
  await start($, false)
  expect(seen.asked).toEqual([])
})

test('with a profile there is no question and Claude gets the profile', async ($, on) => {
  const seen = engine(on, { answer: null, profile: PROFILE })
  await start($)
  expect(seen.asked).toEqual([])
  const text = await guide($)
  expect(text).toMatch(/voice:draft/)
  expect(text).toMatch(/## Email/)
  expect(text).toMatch(PATH)
})

test('/voice setup asks again even with a profile; /voice shows it', async ($, on) => {
  const seen = engine(on, { answer: SOURCES[1], profile: PROFILE })
  await start($)
  expect((await run($, '')).text).toMatch(/Voices: Email, Academic/)
  await run($, 'setup')
  expect(seen.asked.length).toBe(1)
  expect(seen.submitted[0]).toMatch(/from: Slack\./)
})

test('without a profile Claude only gets a pointer to /voice setup', async ($, on) => {
  engine(on, { answer: null, saved: { setupOffered: true } })
  await start($)
  expect(await guide($)).toMatch(/\/voice setup/)
})
