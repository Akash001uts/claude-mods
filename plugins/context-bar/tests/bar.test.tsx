import { expect, mock, test } from 'claude-code/testing'
import type { ContextCategory, SessionUsage } from 'claude-code'

import { INTRO, allocate } from '../hooks/register'

const row = (name: string, tokens: number, color: string, kind: ContextCategory['kind']): ContextCategory => ({
  name,
  tokens,
  color,
  kind,
  isDeferred: kind === 'deferred',
})

const USAGE: SessionUsage = {
  startedAt: 0,
  rateLimits: [],
  context: {
    tokens: 60_000,
    window: 200_000,
    percent: 30,
    breakdown: {
      categories: [
        row('System prompt', 4_000, 'promptBorder', 'used'),
        row('Messages', 56_000, 'permission', 'used'),
        row('MCP tools', 9_000, 'suggestion', 'deferred'),
        row('Free space', 107_000, 'inactive', 'free'),
        row('Autocompact buffer', 33_000, 'warning', 'buffer'),
      ],
      totalTokens: 60_000,
      maxTokens: 200_000,
      rawMaxTokens: 200_000,
      autocompactSource: 'model-default',
      percentage: 30,
      gridRows: [],
      model: 'test',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
  },
}

const BAND = {
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
}

test('allocate fills the width exactly and keeps small categories visible', () => {
  const segs = [
    { name: 'a', color: 'x', tokens: 100, kind: 'used' as const },
    { name: 'b', color: 'x', tokens: 50_000, kind: 'used' as const },
    { name: 'free', color: 'x', tokens: 149_900, kind: 'free' as const },
  ]
  const cells = allocate(segs, 200_000, 60)
  expect(cells.reduce((a, b) => a + b, 0)).toBe(60)
  expect(cells[0]).toBe(1)
})

test('is on by default in a new session', async ($, on) => {
  on('session.usage', () => ({ value: USAGE }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /30%/ })).toBeDefined()
  await ui.unmount()
})

test('draws the bar, toggles off and on with /context-bar', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))
  // Stands in for the engine's own band when the mod passes.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const toggle = () =>
    $.command.run({ command: 'context-bar', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  for (const surface of ['terminal', 'desktop'] as const) {
    // Off then on forces a fresh breakdown read.
    expect((await toggle()).text).toBe('Context bar off.')
    let ui = await $.ui.mount({ plugin: 'context-bar', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /30%/ })).toBeUndefined()
    await ui.unmount()

    expect((await toggle()).text).toBe('Context bar on.')
    ui = await $.ui.mount({ plugin: 'context-bar', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: /30% 60\.0k\/200\.0k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Messages 56\.0k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /MCP tools/ })).toBeUndefined()
    // What draws beneath it still does.
    expect(await ui.find({ key: 'engine' })).toBeDefined()
    await ui.unmount()
  }
})

const HOUR = 3_600_000
// Two hours into a session, with both rate-limit windows read and compaction on at 160k.
const RICH: SessionUsage = {
  ...USAGE,
  startedAt: 1_000,
  rateLimits: [
    { kind: 'five_hour', percentUsed: 42, resetsAt: new Date(1_000 + 2 * HOUR + 2 * HOUR + 14 * 60_000).toISOString() },
    { kind: 'seven_day', percentUsed: 18 },
  ],
  context: {
    ...USAGE.context,
    breakdown: {
      ...USAGE.context.breakdown!,
      autoCompactThreshold: 160_000,
      memoryFiles: [
        { path: 'C:\\Users\\me\\.claude\\CLAUDE.md', type: 'User', tokens: 1_200 },
        { path: 'C:\\proj\\.claude\\CLAUDE.md', type: 'Project', tokens: 3_400 },
      ],
      mcpTools: [
        { name: 'mcp__gmail__send', serverName: 'gmail', tokens: 700, isLoaded: true },
        { name: 'mcp__gmail__read', serverName: 'gmail', tokens: 500, isLoaded: false },
      ],
      apiUsage: { input_tokens: 10, output_tokens: 900, cache_read_input_tokens: 55_000, cache_creation_input_tokens: 4_000 },
    },
  },
}

test('third line shows rate limits, room before compaction and session length', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 + 2 * HOUR })
  on('session.usage', () => ({ value: RICH }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })

  let ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /5h 42% \(resets in 2h 14m\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /7d 18%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /100\.0k to compact/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /session 2h 0m/ })).toBeDefined()
  await ui.unmount()

  // The minute ticker moves the session length without a new usage read.
  await clock.advance(5 * 60_000)
  ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /session 2h 5m/ })).toBeDefined()
  await ui.unmount()

  // No room for a third row: the bar keeps its first two.
  ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND, props: { ...BAND.props, maxRows: 2 } })
  expect(await ui.find({ type: 'Text', text: /to compact/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /30%/ })).toBeDefined()
  await ui.unmount()
})

test('no third line off a subscription with compaction off', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /5h|to compact|session/ })).toBeUndefined()
  await ui.unmount()
})

test('/context-bar details opens the breakdown pane without toggling the bar', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: RICH }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  const run = (args: string) =>
    $.command.run({ command: 'context-bar', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

  expect((await run(' details ')).text).toBe('Context details opened.')
  expect(opened).toEqual(['context-details'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({
      plugin: 'context-bar',
      surface,
      component: 'Pane',
      requestId: 'context-details',
      props: { title: 'Context details', isFocused: false, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await pane.find({ type: 'Text', text: /…\/\.claude\/CLAUDE\.md/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /3\.4k/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /gmail/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /1\/2 tools loaded/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /cache read 55\.0k/ })).toBeDefined()
    await pane.unmount()
  }

  // The bar is still on: the next plain toggle turns it off.
  expect((await run('')).text).toBe('Context bar off.')
})

const HINT = {
  component: 'PromptHint' as const,
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
}

test('position below draws the bar under the prompt and leaves the band to others', { options: { position: 'below' } }, async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })

  const hint = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...HINT })
  expect(await hint.find({ type: 'Text', text: /30% 60\.0k\/200\.0k/ })).toBeDefined()
  // The engine's hint line still draws.
  expect(await hint.find({ key: 'engine' })).toBeDefined()
  await hint.unmount()
  const band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Text', text: /30%/ })).toBeUndefined()
  expect(await band.find({ key: 'engine' })).toBeDefined()
  await band.unmount()

  // Other surfaces keep it above.
  const deskHint = await $.ui.mount({ plugin: 'context-bar', surface: 'desktop', ...HINT })
  expect(await deskHint.find({ type: 'Text', text: /30%/ })).toBeUndefined()
  await deskHint.unmount()
  const deskBand = await $.ui.mount({ plugin: 'context-bar', surface: 'desktop', ...BAND })
  expect(await deskBand.find({ type: 'Text', text: /30%/ })).toBeDefined()
  await deskBand.unmount()
})

test('position above leaves the hint line alone', async ($, on) => {
  mock.clock(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...HINT })
  expect(await ui.find({ type: 'Text', text: /30%/ })).toBeUndefined()
  await ui.unmount()
})

test('/context-bar below and above move the bar', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.usage', () => ({ value: USAGE }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })

  const res = await $.command.run({ command: 'context-bar', args: 'Below', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(res.text).toBe('Context bar moved below the prompt.')
  const hint = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...HINT })
  expect(await hint.find({ type: 'Text', text: /30%/ })).toBeDefined()
  await hint.unmount()

  await $.command.run({ command: 'context-bar', args: 'above', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  const band = await $.ui.mount({ plugin: 'context-bar', surface: 'terminal', ...BAND })
  expect(await band.find({ type: 'Text', text: /30%/ })).toBeDefined()
  await band.unmount()
})

test('explains itself once after install, and again with /context-bar help', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('session.usage', () => ({ value: USAGE }))
  on('command.register', () => ({ value: { command: 'context-bar' } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  const logged: string[] = []
  on('ui.log', ($, e) => {
    logged.push(e.text)
    return { value: undefined }
  })

  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })
  expect(logged).toEqual(INTRO)
  // A second session (or a reload) stays quiet.
  await $.session.start({ cwd: 'C:/', surface: 'terminal', isInteractive: true })
  expect(logged.length).toBe(INTRO.length)

  const res = await $.command.run({ command: 'context-bar', args: 'help', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect(res.text).toBe('Context bar help shown above.')
  expect(logged.length).toBe(INTRO.length * 2)
})
