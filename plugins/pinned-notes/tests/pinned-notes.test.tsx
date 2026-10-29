import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { KEEP, UNPIN, fit, parts } from '../hooks/register'

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
}

// What the person answers when asked about the last session's pins; null dismisses the question.
// `root` is the project the session runs in.
type Asking = { answer: string | null; questions: string[]; id: string; root?: string }

// Stands in for the engine beneath the plugin.
function engine(on: On, id = 's1', saved: Record<string, unknown> = {}, asking: Asking = { answer: KEEP, questions: [], id }) {
  asking.id = id
  mock.clock(on)
  mock.store(on, saved)
  on('session.id', () => ({ value: asking.id }))
  on('session.root', () => ({ value: asking.root ?? 'C:\\Proj' }))
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = e.questions[0]!.question
    asking.questions.push(question)
    if (asking.answer === null) return { deny: 'The user dismissed the question.' }
    return { result: { questions: e.questions, answers: { [question]: asking.answer } } }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', () => ({ value: undefined }))
  on('classic.SessionStart', () => ({}))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  // What else draws above the prompt (context-bar, say).
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="beneath" />
  })
}

// Waits for what session.start leaves running (the question about the last session's pins).
declare const setTimeout: (done: () => void, ms: number) => unknown
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>(done => setTimeout(done, 0))
}
const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  await settle()
}
const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
const COMPOSE = { model: 'test', promptModel: 'test', surfaces: ['terminal' as const], tools: [], outputStyle: null, traits: [] }
const pinsSection = async ($: Engine) => (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'pinned-notes:pins')?.text

test('/pin shows the note above the prompt and gives it to Claude', async ($, on) => {
  engine(on)
  await start($)
  expect(await pinsSection($)).toBeUndefined()

  expect((await run($, 'pin', 'Use Australian spelling')).text).toMatch(/Pinned \(#1\)/)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pinned-notes', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /Use Australian spelling/ })).toBeDefined()
    // Whatever else draws there still does.
    expect(await ui.find({ key: 'beneath' })).toBeDefined()
    await ui.unmount()
  }
  expect(await pinsSection($)).toMatch(/1\. Use Australian spelling/)
})

test('/pin on its own pins the last message typed, not a slash command', async ($, on) => {
  engine(on)
  await start($)
  expect((await run($, 'pin')).text).toMatch(/Nothing to pin yet/)
  await $.prompt.submit({ text: 'The API key lives in .env.local', wait: false, origin: { kind: 'composer' } })
  await $.prompt.submit({ text: '/context', wait: false, origin: { kind: 'composer' } })
  await run($, 'pin')
  expect((await run($, 'pin', 'list')).text).toBe('1. The API key lives in .env.local')
})

test('/unpin removes one or all, and the band and section go with them', async ($, on) => {
  engine(on)
  await start($)
  await run($, 'pin', 'one')
  await run($, 'pin', 'two')
  await run($, 'pin', 'three')
  expect((await run($, 'unpin', '2')).text).toMatch(/Unpinned #2: two/)
  expect((await run($, 'pin', 'list')).text).toBe('1. one\n2. three')
  expect((await run($, 'unpin')).text).toMatch(/Unpinned #2: three/)
  expect((await run($, 'unpin', '9')).text).toMatch(/Usage/)
  await run($, 'unpin', 'all')
  expect(await pinsSection($)).toBeUndefined()
  // Started again (a reload or resume), nothing comes back.
  await start($)
  expect((await run($, 'pin', 'list')).text).toMatch(/Nothing pinned/)
  const ui = await $.ui.mount({ plugin: 'pinned-notes', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /📌/ })).toBeUndefined()
  await ui.unmount()
})

test('a resumed session gets its pins back from the store', async ($, on) => {
  engine(on, 'resumed', {
    'session:resumed': { pins: [{ text: 'Keep the README in my voice', pinnedAt: 0 }], savedAt: 0 },
    'session:other': { pins: [{ text: 'not this one', pinnedAt: 0 }], savedAt: 0 },
  })
  await start($)
  expect((await run($, 'pin', 'list')).text).toBe('1. Keep the README in my voice')
})

test('hide keeps Claude\'s copy; a long list folds into "+N more"', async ($, on) => {
  engine(on)
  await start($)
  for (const n of [1, 2, 3, 4, 5]) await run($, 'pin', `note ${n}`)

  let ui = await $.ui.mount({ plugin: 'pinned-notes', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /note 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /note 3/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\+3 more/ })).toBeDefined()
  await ui.unmount()

  // A short terminal: one row, the first pin and the count share it.
  ui = await $.ui.mount({ plugin: 'pinned-notes', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows: 4 } })
  expect(await ui.find({ type: 'Text', text: /\(\+4 more\) note 1/ })).toBeDefined()
  await ui.unmount()

  await run($, 'pin', 'hide')
  ui = await $.ui.mount({ plugin: 'pinned-notes', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /note/ })).toBeUndefined()
  await ui.unmount()
  expect(await pinsSection($)).toMatch(/5\. note 5/)
})

test('URLs in a pin draw as links', async ($, on) => {
  expect(parts('Docs: https://code.claude.com/docs/plugins, then deploy.')).toEqual([
    { part: 'Docs: ', isUrl: false },
    { part: 'https://code.claude.com/docs/plugins', isUrl: true },
    { part: ', then deploy.', isUrl: false },
  ])
  engine(on)
  await start($)
  await run($, 'pin', 'Spec at https://example.com/spec?id=3')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pinned-notes', surface, ...BAND })
    const link = await ui.find({ type: 'Link' })
    expect(link?.props.href).toBe('https://example.com/spec?id=3')
    await ui.unmount()
  }
})

test('a long pin is cut to fit, keeping its links on screen', async ($, on) => {
  const url = 'https://github.com/Akash001uts/claude-mods/tree/main/plugins/pin'
  const width = (pieces: ReturnType<typeof fit>) => pieces.reduce((n, p) => n + p.text.length, 0)

  // Text after the link gives way first.
  let pieces = fit(`See ${url} and then read every one of the notes that come after it carefully`, 80)
  expect(width(pieces)).toBe(80)
  expect(pieces[1]).toEqual({ text: url, href: url })
  expect(pieces[2]!.text.endsWith('…')).toBe(true)

  // Then the text before it.
  pieces = fit(`A long sentence that comes before the link and keeps on going for a while ${url}`, 70)
  expect(width(pieces)).toBe(70)
  expect(pieces[0]!.text.endsWith('…')).toBe(true)
  expect(pieces[1]).toEqual({ text: url, href: url })

  // A narrow band shortens the link's text, never where it goes.
  pieces = fit(`Docs ${url}`, 40)
  expect(width(pieces)).toBeLessThanOrEqual(40)
  expect(pieces[1]!.href).toBe(url)
  expect(pieces[1]!.text).toMatch(/^github\.com\/.*….*plugins\/pin$/)

  // Short pins are left alone.
  expect(fit('short', 80)).toEqual([{ text: 'short' }])

  engine(on)
  await start($)
  await run($, 'pin', `Look at ${url} before you start on anything else in this repo today, it explains the layout`)
  const ui = await $.ui.mount({ plugin: 'pinned-notes', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 60 } })
  // Cut off, so the row is a button that opens it out.
  expect(await ui.find({ key: 'more-1' })).toBeDefined()
  // The link is still a link, shortened to fit.
  const link = await ui.find({ type: 'Link' })
  expect(link?.props.href).toBe(url)
  expect(link?.text).toMatch(/github\.com\/Akash001uts\/claude-mods\/….*plugins\/pin$/)
  await ui.unmount()
})

test('a cut-off pin opens out when pressed, and folds back', async ($, on) => {
  const url = 'https://github.com/Akash001uts/claude-mods/tree/main/plugins/pin'
  const long = `Look at ${url} before you start on anything else in this repo today, it explains the layout`
  engine(on)
  await start($)
  await run($, 'pin', long)
  await run($, 'pin', 'short one')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pinned-notes', surface, ...BAND, props: { ...BAND.props, bodyColumns: 60 } })
    // A pin that fits is no button.
    expect(await ui.find({ key: 'more-2' })).toBeUndefined()

    // Cut off, its link already works; pressing the text beside it opens it out.
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe(url)
    await ui.press({ key: 'more-1-0' })
    expect(await ui.find({ type: 'Text', text: /it explains the layout/ })).toBeDefined()
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe(url)

    await ui.press({ key: 'less-1' })
    expect(await ui.find({ type: 'Text', text: /it explains the layout/ })).toBeUndefined()
    // So does the ▾.
    await ui.press({ key: 'more-1' })
    await ui.press({ key: 'less-1' })
    await ui.unmount()
  }
})

const BOTH = '1. Use Australian spelling\n2. Branch is pins-carry'

const LAST_SESSION = {
  'session:old': { pins: [{ text: 'Use Australian spelling', pinnedAt: 0 }, { text: 'Branch is pins-carry', pinnedAt: 0 }], savedAt: 0 },
  'last:c:/proj': { pins: [{ text: 'Use Australian spelling', pinnedAt: 0 }, { text: 'Branch is pins-carry', pinnedAt: 0 }], savedAt: 0, sessionId: 'old' },
}

test("a new session is asked about the last session's pins, and keeps them", async ($, on) => {
  const asking: Asking = { answer: KEEP, questions: [], id: '' }
  engine(on, 'new', { ...LAST_SESSION }, asking)
  await start($)
  expect(asking.questions).toHaveLength(1)
  expect(asking.questions[0]).toMatch(/Keep the 2 pins from your last session\? 1\. Use Australian spelling; 2\. Branch is pins-carry/)
  expect((await run($, 'pin', 'list')).text).toBe(BOTH)
  expect(await pinsSection($)).toMatch(/2\. Branch is pins-carry/)

  // A reload starts the session again: it has its own pins now, so no second question.
  await start($)
  expect(asking.questions).toHaveLength(1)

  // They keep following into the session after that, until unpinned.
  asking.id = 'newer'
  await start($)
  expect(asking.questions).toHaveLength(2)
  expect((await run($, 'pin', 'list')).text).toBe(BOTH)
  await run($, 'unpin', 'all')
  asking.id = 'newest'
  await start($)
  expect(asking.questions).toHaveLength(2)
  expect((await run($, 'pin', 'list')).text).toMatch(/Nothing pinned/)
})

test("unpinning them leaves them behind, and the next session isn't asked again", async ($, on) => {
  const asking: Asking = { answer: UNPIN, questions: [], id: '' }
  engine(on, 'new', { ...LAST_SESSION }, asking)
  await start($)
  expect(asking.questions).toHaveLength(1)
  expect((await run($, 'pin', 'list')).text).toMatch(/Nothing pinned/)
  await start($)
  asking.id = 'newer'
  await start($)
  expect(asking.questions).toHaveLength(1)
  // The old session still has them if it's resumed.
  asking.id = 'old'
  await start($)
  expect((await run($, 'pin', 'list')).text).toBe(BOTH)
  expect(asking.questions).toHaveLength(1)
})

test('/clear asks about the pins it leaves behind', async ($, on) => {
  const asking: Asking = { answer: KEEP, questions: [], id: '' }
  engine(on, 'before', {}, asking)
  await start($)
  await run($, 'pin', 'Use Australian spelling')
  asking.id = 'after'
  await $.classic.SessionStart({ source: 'clear' })
  await settle()
  expect(asking.questions).toEqual([expect.stringMatching(/Keep the pin from your last session\? 1\. Use Australian spelling/)])
  expect((await run($, 'pin', 'list')).text).toBe('1. Use Australian spelling')

  // Unpinning them instead leaves the cleared session with none.
  asking.answer = UNPIN
  asking.id = 'after that'
  await $.classic.SessionStart({ source: 'clear' })
  await settle()
  expect(asking.questions).toHaveLength(2)
  expect((await run($, 'pin', 'list')).text).toMatch(/Nothing pinned/)
})

test('dismissing the question keeps the pins', async ($, on) => {
  const asking: Asking = { answer: null, questions: [], id: '' }
  engine(on, 'new', { ...LAST_SESSION }, asking)
  await start($)
  expect(asking.questions).toHaveLength(1)
  expect((await run($, 'pin', 'list')).text).toBe(BOTH)
})

test('nobody is asked under -p, and a resumed session just gets its own pins', async ($, on) => {
  const asking: Asking = { answer: KEEP, questions: [], id: '' }
  engine(on, 'new', { ...LAST_SESSION, 'session:mine': { pins: [{ text: 'mine', pinnedAt: 0 }], savedAt: 1 } }, asking)
  await $.session.start({ cwd: 'C:/proj', surface: null, isInteractive: false })
  await settle()
  expect((await run($, 'pin', 'list')).text).toMatch(/Nothing pinned/)
  asking.id = 'mine'
  await start($)
  expect((await run($, 'pin', 'list')).text).toBe('1. mine')
  expect(asking.questions).toHaveLength(0)
})

test("another project's pins aren't offered", async ($, on) => {
  const asking: Asking = { answer: KEEP, questions: [], id: '', root: 'C:\\Other' }
  engine(on, 'new', { ...LAST_SESSION }, asking)
  await start($)
  expect(asking.questions).toHaveLength(0)
  expect((await run($, 'pin', 'list')).text).toMatch(/Nothing pinned/)

  // Pins left here are offered here, and back in the first project it's still that project's pins.
  await run($, 'pin', 'Other project note')
  asking.id = 'next'
  await start($)
  expect(asking.questions).toEqual([expect.stringMatching(/Other project note/)])
  asking.id = 'back'
  asking.root = 'c:/proj'
  await start($)
  expect(asking.questions[1]).toMatch(/Keep the 2 pins/)
})
