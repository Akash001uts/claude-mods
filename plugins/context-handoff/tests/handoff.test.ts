import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionCompactResult, SessionUsage } from 'claude-code'
import type { MockClock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { TOOL_NAME } from '../hooks/register'

const usage = (percent: number): SessionUsage => ({
  startedAt: 0,
  rateLimits: [],
  context: { tokens: percent * 2000, window: 200_000, percent },
})

const MSGS = [{ role: 'user' as const, text: 'summary', toolUses: [] }]

// Detached work (a submit, a fill) lands once the event loop settles.
let clock: MockClock

// Stands in for the engine beneath the plugin: answers its calls and records what it asked for.
function engine(on: On, start: { percent: number }, compact: () => SessionCompactResult = () => ({ messages: MSGS })) {
  const seen = { submitted: [] as string[], contexts: [] as (readonly string[])[], commands: [] as { command: string; args: string }[], filled: [] as string[], toasts: [] as string[] }
  clock = mock.clock(on)
  mock.store(on)
  on('session.usage', () => ({ value: usage(start.percent) }))
  on('session.root', () => ({ value: 'C:/proj' }))
  on('command.register', () => ({ value: { command: 'handoff' } }))
  on('tool.register', () => ({ value: { tool: TOOL_NAME } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('prompt.submit', ($, e) => {
    seen.submitted.push(e.text)
    seen.contexts.push(e.context ?? [])
    return { text: e.text, context: e.context }
  })
  on('prompt.fill', ($, e) => {
    seen.filled.push(e.text)
    return { isFilled: true }
  })
  on('command.run', ($, e) => {
    seen.commands.push({ command: e.command, args: e.args })
    return { text: '' }
  })
  on('turn.complete', () => ({ text: '' }))
  on('session.compact', () => compact())
  return seen
}

const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
  await clock.settle()
}
const turn = async ($: Engine, extra: { agentId?: string; isAborted?: boolean } = {}) => {
  await $.turn.complete({
    answer: 'done',
    durationMs: 1000,
    turnId: 't1',
    isAborted: extra.isAborted ?? false,
    reason: extra.isAborted ? 'aborted' : 'answer',
    ...(extra.agentId ? { agentId: extra.agentId } : {}),
  })
  await clock.settle()
}
const callTool = ($: Engine, input: Record<string, string>) => $.tool.call({ tool: TOOL_NAME, ...input } as never)

test('every prompt carries the context reading for Claude', async ($, on) => {
  const seen = engine(on, { percent: 34 })
  await start($)
  await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
  expect(seen.contexts.at(-1)).toEqual(['[context-handoff] Context window: 34% used (68.0k of 200.0k); handoff at 50%.'])
})

test('crossing the threshold sends the handoff prompt once', async ($, on) => {
  const level = { percent: 40 }
  const seen = engine(on, level)
  await start($)

  await turn($)
  expect(seen.submitted).toHaveLength(0)

  level.percent = 52
  await turn($, { agentId: 'sub-1' })
  await turn($, { isAborted: true })
  expect(seen.submitted).toHaveLength(0)

  await turn($)
  expect(seen.submitted).toHaveLength(1)
  expect(seen.submitted[0]).toContain('context-handoff:wrap-up')
  expect(seen.submitted[0]).toContain(TOOL_NAME)

  // The wrapping turn ends without the tool call: one toast, then no re-firing.
  await turn($)
  expect(seen.toasts.some(t => t.includes('/handoff'))).toBe(true)
  await turn($)
  expect(seen.submitted).toHaveLength(1)
})

test('the tool call compacts with its instructions, then the kickoff prompt carries on', async ($, on) => {
  const level = { percent: 55 }
  const seen = engine(on, level)
  await start($)
  await turn($)
  expect(seen.submitted).toHaveLength(1)

  const answer = await callTool($, {
    mode: 'continue',
    handoffPath: '.claude/handoff.md',
    compactInstructions: 'Keep the plan and file paths.',
    kickoffPrompt: 'Read .claude/handoff.md and carry on with step 2.',
  })
  expect(String(answer.result)).toContain('Compaction starts')

  await turn($)
  expect(seen.commands).toEqual([{ command: 'compact', args: 'Keep the plan and file paths.' }])

  // What /compact does next in a session: the compaction, with the plugin's session.compact hook in its chain.
  await $.session.compact({ trigger: 'manual', instructions: 'Keep the plan and file paths.', messages: MSGS })
  await clock.settle()
  expect(seen.submitted.at(-1)).toBe('Read .claude/handoff.md and carry on with step 2.')
})

test('a skipped compaction sends no kickoff', async ($, on) => {
  const seen = engine(on, { percent: 55 }, () => ({ skip: 'blocked by a hook' }))
  await start($)
  await turn($)
  await callTool($, { mode: 'continue', handoffPath: 'h.md', compactInstructions: 'x', kickoffPrompt: 'carry on' })
  await turn($)
  expect(seen.commands.map(c => c.command)).toEqual(['compact'])
  await $.session.compact({ trigger: 'manual', messages: MSGS })
  await clock.settle()
  expect(seen.submitted).not.toContain('carry on')
  expect(seen.toasts.some(t => t.includes('skipped'))).toBe(true)
})

test("the engine's own autocompact sends no kickoff", async ($, on) => {
  const seen = engine(on, { percent: 55 })
  await start($)
  await turn($)
  await callTool($, { mode: 'continue', handoffPath: 'h.md', compactInstructions: 'x', kickoffPrompt: 'carry on' })
  // Autocompact lands before this plugin's /compact ran: the handoff is still only 'ready'.
  await $.session.compact({ trigger: 'auto', messages: MSGS })
  await clock.settle()
  expect(seen.submitted).not.toContain('carry on')
})

test("the plugin's own tool is allowed without a prompt", async ($, on) => {
  engine(on, { percent: 10 })
  on('tool.check', () => ({ decision: 'ask' }))
  await start($)
  expect((await $.tool.check({ tool: TOOL_NAME, input: {} })).decision).toBe('allow')
})

test('an end-of-session handoff fills the next session prompt box', async ($, on) => {
  const seen = engine(on, { percent: 20 })
  await start($)
  await callTool($, { mode: 'end', handoffPath: '.claude/handoff.md', kickoffPrompt: 'Pick up from .claude/handoff.md.' })
  await start($)
  expect(seen.filled).toContain('Pick up from .claude/handoff.md.')
  // Used once, then cleared.
  expect((await $.command.run({ command: 'handoff', args: 'resume', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })).text).toBe(
    'No saved kickoff prompt for this project.',
  )
})

test('/handoff off stops the automatic handoff for the session', async ($, on) => {
  const seen = engine(on, { percent: 70 })
  await start($)
  const run = (args: string) => $.command.run({ command: 'handoff', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect((await run('off')).text).toBe('Auto handoff off for this session.')
  await turn($)
  expect(seen.submitted).toHaveLength(0)
  expect((await run('status')).text).toContain('off for this session')

  // A hot reload or a /config change fires session.start again; the session's choice stands.
  await start($)
  await turn($)
  expect(seen.submitted).toHaveLength(0)
})

const handoff = ($: Engine, args: string) =>
  $.command.run({ command: 'handoff', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

test('/handoff on its own starts a handoff straight away, at any level', async ($, on) => {
  const seen = engine(on, { percent: 12 })
  await start($)
  expect((await handoff($, '')).text).toBe('Handoff started.')
  await clock.settle()
  expect(seen.submitted).toHaveLength(1)
  expect((await handoff($, 'now')).text).toBe('A handoff is already running.')
})

test('/handoff 60 saves when the auto handoff kicks in', async ($, on) => {
  const level = { percent: 55 }
  const seen = engine(on, level)
  const saved: unknown[] = []
  on('config.set', ($, e) => {
    saved.push([e.key, e.value])
    return { value: e.value }
  })
  await start($)
  expect((await handoff($, '60')).text).toBe('Auto handoff at 60%. Saved for future sessions too.')
  expect(saved).toEqual([['context-handoff.threshold', 60]])
  expect((await handoff($, 'at 2%')).text).toBe('Pick a threshold between 5% and 95%.')

  await turn($)
  expect(seen.submitted).toHaveLength(0)
  level.percent = 61
  await turn($)
  expect(seen.submitted).toHaveLength(1)
  expect((await handoff($, 'status')).text).toContain('auto at 60%')
})

test('a threshold that cannot be saved still holds for the session', async ($, on) => {
  const seen = engine(on, { percent: 30 })
  on('config.set', () => ({ deny: 'managed by policy' }))
  await start($)
  expect((await handoff($, '25%')).text).toBe(
    "Auto handoff at 25%. For this session only (couldn't save the setting: managed by policy). The window is already at 30%, so it starts after your next turn.",
  )
  await turn($)
  expect(seen.submitted).toHaveLength(1)
})

for (const draft of ['', 'half a thought']) {
  test(`ask mode ${draft ? 'leaves a draft alone' : 'puts the handoff prompt in an empty box'}`, { options: { mode: 'ask' } }, async ($, on) => {
    const seen = engine(on, { percent: 60 })
    on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
    await start($)
    await turn($)
    expect(seen.submitted).toHaveLength(0)
    expect(seen.filled).toHaveLength(draft ? 0 : 1)
    expect(seen.toasts.some(t => t.includes(draft ? '/handoff' : 'press Enter'))).toBe(true)
  })
}
