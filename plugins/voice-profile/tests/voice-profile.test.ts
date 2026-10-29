import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

import { QUESTION, SKIPPED, SOURCES, TRIMMED, parseAnswer, promptProfile, voicesIn } from '../hooks/register'

const PATH = 'C:/Users/me/.claude/voice-profile/profile.md'
const PROFILE = [
  '# Voice profile',
  '## Email\nSummary: short, "Hi" + first name\n- Sign-off: Regards, Akash',
  '## Academic\nSummary: first person, direct',
  '## Remembered\n- Never say "I hope this finds you well"\n- No em dashes',
  '## Nudges\n| Voice | Direction | Count | Offered |\n| --- | --- | --- | --- |\n| Email | shorter | 2 | no |',
].join('\n\n')

// What the person ticks; null dismisses the list. `profile` can change mid-test, like Claude writing the file.
type World = { answer: string | null; profile?: string; saved?: Record<string, unknown>; submitFails?: boolean }
type Seen = { asked: { question: string; options: string[]; multiSelect: boolean }[]; submitted: string[]; logs: string[]; toasts: string[] }

let clock: MockClock

// Stands in for the engine beneath the plugin.
function engine(on: On, world: World): Seen {
  const seen: Seen = { asked: [], submitted: [], logs: [], toasts: [] }
  clock = mock.clock(on)
  mock.store(on, world.saved ?? {})
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  // The engine hands paths on in the platform's own separators.
  const isProfile = (path: string) => world.profile !== undefined && path.replace(/\\/g, '/') === PATH
  // Each new text counts as a fresh write, so the stat changes with it.
  let writes = 0
  let last: string | undefined
  const mtime = () => {
    if (world.profile !== last) {
      last = world.profile
      writes++
    }
    return writes
  }
  on('fs.stat', ($, e) => {
    if (!isProfile(e.path)) throw new Error('ENOENT')
    return { value: { kind: 'file' as const, size: world.profile!.length, mtimeMs: mtime(), isLink: false } }
  })
  on('fs.read', ($, e) => {
    if (!isProfile(e.path)) throw new Error('ENOENT')
    return { value: world.profile! }
  })
  on('session.id', () => ({ value: 's1' }))
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

const start = async ($: Engine, isInteractive = true) => {
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive })
  await clock.advance(2000)
  await clock.settle()
}
const run = async ($: Engine, args: string) => {
  const r = await $.command.run({ command: 'write', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await clock.settle()
  return r
}
const COMPOSE = { model: 'test', promptModel: 'test', surfaces: ['terminal' as const], tools: [], outputStyle: null, traits: [] }
const guide = async ($: Engine) => (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'voice-profile:guide')?.text

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
  expect(seen.submitted[0]).toMatch(/voice-profile:setup/)
  expect(seen.submitted[0]).toMatch(PATH)
})

test('text typed under Other goes to the setup prompt, commas and all', async ($, on) => {
  const seen = engine(on, { answer: `${SOURCES[0]}, my blog, the essays folder` })
  await start($)
  expect(seen.submitted[0]).toMatch(/^Set up my voice profile from: Gmail, a source I typed in \("my blog, the essays folder"\)\./)
})

test('Other on its own still starts setup', async ($, on) => {
  const seen = engine(on, { answer: 'WhatsApp exports' })
  await start($)
  expect(seen.logs).toEqual([])
  expect(seen.submitted[0]).toMatch(/a source I typed in \("WhatsApp exports"\)/)
})

test('parseAnswer splits labels from free text', () => {
  expect(parseAnswer(`${SOURCES[1]},${SOURCES[2]}`)).toEqual({ picked: [SOURCES[1], SOURCES[2]], other: '' })
  expect(parseAnswer('')).toEqual({ picked: [], other: '' })
})

test('no question under -p', async ($, on) => {
  const seen = engine(on, { answer: SOURCES[0] })
  await start($, false)
  expect(seen.asked).toEqual([])
})

test('a question left open in an earlier session is asked again', async ($, on) => {
  const seen = engine(on, { answer: null, saved: { setupOffered: 'old-session' } })
  await start($)
  expect(seen.asked.length).toBe(1)
})

test('a hot reload does not ask twice in the same session', async ($, on) => {
  const seen = engine(on, { answer: null, saved: { setupOffered: 's1' } })
  await start($)
  expect(seen.asked).toEqual([])
})

test('0.1.0 users who were already asked are not asked again', async ($, on) => {
  const seen = engine(on, { answer: null, saved: { setupOffered: true } })
  await start($)
  expect(seen.asked).toEqual([])
})

test('with a profile there is no question and Claude gets the profile, rules first and no nudge table', async ($, on) => {
  const seen = engine(on, { answer: null, profile: PROFILE })
  await start($)
  expect(seen.asked).toEqual([])
  const text = (await guide($))!
  expect(text).toMatch(/voice-profile:draft/)
  expect(text).toMatch(PATH)
  expect(text.indexOf('## Remembered')).toBeLessThan(text.indexOf('## Email'))
  expect(text).not.toMatch(/Nudges|\| Count/)
})

test('a profile written mid-session reaches Claude on the next request', async ($, on) => {
  const world: World = { answer: null, saved: { setupOffered: 'done' } }
  engine(on, world)
  await start($)
  expect(await guide($)).toMatch(/no voice profile yet/)
  world.profile = PROFILE
  expect(await guide($)).toMatch(/## Email/)
  world.profile = PROFILE.replace('No em dashes', 'No em dashes\n- Australian spelling')
  expect(await guide($)).toMatch(/Australian spelling/)
})

test('a long profile keeps the remembered rules and voice summaries, and says so once', async ($, on) => {
  const long = PROFILE.replace('- Sign-off: Regards, Akash', `- Sign-off: Regards, Akash\n${'- Detail line\n'.repeat(900)}`)
  const seen = engine(on, { answer: null, profile: long })
  await start($)
  const text = (await guide($))!
  expect(text).toMatch(/No em dashes/)
  expect(text).toMatch(/## Email\nSummary: short/)
  expect(text).not.toMatch(/Detail line/)
  expect(text).toMatch(/read the file/)
  await guide($)
  expect(seen.logs).toEqual([TRIMMED])
})

test('promptProfile cuts by whole lines when the rules alone are over the cap', () => {
  const { text, isTrimmed } = promptProfile('## Remembered\n- one rule here\n- two rule here', 30)
  expect(isTrimmed).toBe(true)
  expect(text).toBe('## Remembered\n- one rule here')
})

test('a profile with no ## headings is sent as written', () => {
  expect(promptProfile('# My voice\nShort emails, no exclamation marks.')).toEqual({
    text: '# My voice\nShort emails, no exclamation marks.',
    isTrimmed: false,
  })
})

test('hand-written notes above the first section are kept, the title is not', () => {
  const { text } = promptProfile('# Voice profile\nAlways Australian spelling.\n\n## Email\nSummary: short')
  expect(text).toBe('Always Australian spelling.\n\n## Email\nSummary: short')
})

test('remembered and nudges headings are matched loosely, and a profile starting on a section has no notes', () => {
  const { text } = promptProfile('## Email\nSummary: short\n\n## remembered\n- No em dashes\n\n## Nudges (counts)\n| x |')
  expect(text).toBe('## remembered\n- No em dashes\n\n## Email\nSummary: short')
  expect(voicesIn('## Email\n\n## remembered\n\n## Nudges (counts)')).toEqual(['Email'])
})

test('voicesIn counts custom headings and skips the bookkeeping ones', () => {
  expect(voicesIn(`${PROFILE}\n\n## Cover letters\nSummary: formal`)).toEqual(['Email', 'Academic', 'Cover letters'])
})

test('/write shows each summary and numbered rules; /write setup asks again', async ($, on) => {
  const seen = engine(on, { answer: SOURCES[1], profile: PROFILE })
  await start($)
  const shown = (await run($, '')).text
  expect(shown).toMatch(/Email: short, "Hi" \+ first name/)
  expect(shown).toMatch(/Academic: first person, direct/)
  expect(shown).toMatch(/1\. Never say/)
  expect(shown).toMatch(/2\. No em dashes/)
  await run($, 'setup')
  expect(seen.asked.length).toBe(1)
  expect(seen.submitted[0]).toMatch(/from: Slack\./)
})

test('/write with anything else shows the usage line', async ($, on) => {
  engine(on, { answer: null, profile: PROFILE })
  await start($)
  expect((await run($, 'email')).text).toBe('Usage: /write [setup]')
})

test('a setup prompt that fails to submit says how to retry', async ($, on) => {
  const seen = engine(on, { answer: SOURCES[0], submitFails: true })
  await start($)
  expect(seen.toasts).toEqual(["Voice setup couldn't start: run /write setup to try again"])
})

test('without a profile Claude only gets a pointer to /write setup', async ($, on) => {
  engine(on, { answer: null, saved: { setupOffered: true } })
  await start($)
  expect(await guide($)).toMatch(/\/write setup/)
})
