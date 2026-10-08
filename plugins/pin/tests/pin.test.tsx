import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { fit, parts } from '../hooks/register'

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
}

// Stands in for the engine beneath the plugin.
function engine(on: On, id = 's1', saved: Record<string, unknown> = {}) {
  mock.clock(on)
  mock.store(on, saved)
  on('session.id', () => ({ value: id }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' as const }] }))
  // What else draws above the prompt (context-bar, say).
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="beneath" />
  })
}

const start = ($: Engine) => $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
const COMPOSE = { model: 'test', promptModel: 'test', surfaces: ['terminal' as const], tools: [], outputStyle: null, traits: [] }
const pinsSection = async ($: Engine) => (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'pin:pins')?.text

test('/pin shows the note above the prompt and gives it to Claude', async ($, on) => {
  engine(on)
  await start($)
  expect(await pinsSection($)).toBeUndefined()

  expect((await run($, 'pin', 'Use Australian spelling')).text).toMatch(/Pinned \(#1\)/)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pin', surface, ...BAND })
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
  const ui = await $.ui.mount({ plugin: 'pin', surface: 'terminal', ...BAND })
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

  let ui = await $.ui.mount({ plugin: 'pin', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /note 2/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /note 3/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\+3 more/ })).toBeDefined()
  await ui.unmount()

  // A short terminal: one row, the first pin and the count share it.
  ui = await $.ui.mount({ plugin: 'pin', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows: 4 } })
  expect(await ui.find({ type: 'Text', text: /\(\+4 more\) note 1/ })).toBeDefined()
  await ui.unmount()

  await run($, 'pin', 'hide')
  ui = await $.ui.mount({ plugin: 'pin', surface: 'terminal', ...BAND })
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
    const ui = await $.ui.mount({ plugin: 'pin', surface, ...BAND })
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
  const ui = await $.ui.mount({ plugin: 'pin', surface: 'terminal', ...BAND, props: { ...BAND.props, bodyColumns: 60 } })
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
    const ui = await $.ui.mount({ plugin: 'pin', surface, ...BAND, props: { ...BAND.props, bodyColumns: 60 } })
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
