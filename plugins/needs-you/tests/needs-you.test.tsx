import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

import { isNo, isYes, messages, pick } from '../hooks/slack'

const ME = 'U0ME'
const DM = 'D0DM'

type Sent = { text: string; thread?: string; ts: string }
type World = {
  clock: MockClock
  sent: Sent[]
  // Replies in the DM: by thread ts, plus top-level messages.
  threads: Record<string, { ts: string; text: string; user: string }[]>
  top: { ts: string; text: string; user: string }[]
  submitted: { text: string; asUser?: boolean }[]
  aborted: string[]
  pushes: string[]
  logs: string[]
}

// Stands in for the engine and the Slack connector. `hasSlack` false leaves only the push tool.
function engine(on: On, settings: Record<string, unknown> = {}, hasSlack = true): World {
  const w: World = { clock: mock.clock(on, { now: 1_000_000 }), sent: [], threads: {}, top: [], submitted: [], aborted: [], pushes: [], logs: [] }
  let next = 100
  mock.store(on, { asked: true, settings: { turns: true, permissions: true, questions: true, counter: true, waitMin: 5, ...settings } })
  on('session.root', () => ({ value: 'C:\\Users\\me\\help-drafting-email' }))
  on('session.id', () => ({ value: 's1' }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.log', ($, e) => {
    w.logs.push(String(e.text))
    return { value: undefined }
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('tool.list', () => ({
    value: hasSlack ? [{ name: 'mcp__claude_ai_Slack__slack_send_message', description: '', mcp: true }] : [],
  }))
  on('mcp.call', ($, e) => {
    const text = (v: unknown) => ({ value: { content: [{ type: 'text' as const, text: JSON.stringify(v) }], isError: false } })
    if (e.tool === 'slack_read_user_profile') return text({ user: { id: ME, profile: { first_name: 'Akash' } } })
    if (e.tool === 'slack_send_message') {
      const ts = `${next++}.000`
      w.sent.push({ text: String(e.args.message), thread: e.args.thread_ts as string | undefined, ts })
      return text({ ok: true, channel: DM, ts })
    }
    if (e.tool === 'slack_read_thread') {
      const root = String(e.args.message_ts)
      return text({ messages: [{ ts: root, text: 'ping', user: ME }, ...(w.threads[root] ?? [])] })
    }
    if (e.tool === 'slack_read_channel') return text({ messages: w.top })
    return text({})
  })
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') w.submitted.push({ text: e.text, ...(e.origin.asUser && { asUser: true }) })
    return { text: e.text, context: e.context }
  })
  on('turn.abort', ($, e) => {
    w.aborted.push(e.turnId)
    return { value: undefined }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', { tool: 'PushNotification' }, ($, e) => {
    w.pushes.push(e.message)
    return { result: {}, text: 'sent' }
  })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' }))
  return w
}

const start = ($: Engine) => $.session.start({ cwd: 'C:/x', surface: 'terminal', isInteractive: true })
const finish = async ($: Engine, answer: string) => {
  await $.turn.start({ turnId: 't1', text: 'help me' })
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
}
const wait = async (w: World, minutes: number) => {
  for (let i = 0; i < minutes * 6 + 1; i++) await w.clock.advance(10_000)
}

test('Slack replies are read from the connector, and yes, no and options are understood', async () => {
  expect(messages({ messages: [{ ts: '1.0', text: 'hi', user: ME }, { ts: '2.0', text: 'x', bot_id: 'B1' }] })).toEqual([
    { ts: '1.0', text: 'hi', user: ME, isBot: false, threadTs: undefined },
    { ts: '2.0', text: 'x', user: undefined, isBot: true, threadTs: undefined },
  ])
  expect(isYes('Yes please')).toBe(true)
  expect(isNo('no')).toBe(true)
  expect(isYes('maybe')).toBe(false)
  expect(pick('2', [{ label: 'Tabs' }, { label: 'Spaces' }])).toBe('Spaces')
  expect(pick('spaces', [{ label: 'Tabs' }, { label: 'Spaces' }])).toBe('Spaces')
  expect(pick('neither', [{ label: 'Tabs' }])).toBeUndefined()
})

test('a finished turn pings after 5 minutes, and a reply goes in as your next message', async ($, on) => {
  const w = engine(on)
  await start($)
  await finish($, 'Here is the draft email.')
  await wait(w, 4)
  expect(w.sent).toEqual([])
  await wait(w, 1)
  expect(w.sent[0]?.text).toBe(
    'Hey Akash, help-drafting-email has returned a reply:\n\nHere is the draft email.\n\nReturn to your machine to continue, or reply here with your follow-up.',
  )
  w.threads[w.sent[0]!.ts] = [{ ts: '500.000', text: 'Make it shorter', user: ME }]
  await wait(w, 0)
  expect(w.submitted).toEqual([{ text: 'Make it shorter', asUser: true }])
})

test('answering on the machine first means no ping, and a late reply hears it was already answered', async ($, on) => {
  const w = engine(on, { waitMin: 1 })
  await start($)
  await finish($, 'Done.')
  await $.prompt.submit({ text: 'thanks', origin: { kind: 'composer' }, wait: false })
  await wait(w, 2)
  expect(w.sent).toEqual([])
  await finish($, 'Done again.')
  await wait(w, 1)
  const ping = w.sent[0]!
  await $.prompt.submit({ text: 'ok', origin: { kind: 'composer' }, wait: false })
  w.threads[ping.ts] = [{ ts: '600.000', text: 'go on', user: ME }]
  await wait(w, 0)
  expect(w.submitted).toEqual([])
  expect(w.sent[1]).toEqual({ text: 'Already answered on your machine.', thread: ping.ts, ts: w.sent[1]!.ts })
})

test('only your own Slack user is listened to', async ($, on) => {
  const w = engine(on)
  await start($)
  await finish($, 'Done.')
  await wait(w, 5)
  w.threads[w.sent[0]!.ts] = [{ ts: '700.000', text: 'rm -rf everything', user: 'U0SOMEONE' }]
  await wait(w, 0)
  expect(w.submitted).toEqual([])
})

test('a permission prompt pings; yes is left to the machine, no stops the turn and tells Claude', async ($, on) => {
  const w = engine(on)
  await start($)
  await $.turn.start({ turnId: 't9', text: 'test it' })
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm test' }, session_id: 's1', transcript_path: 'C:/t.jsonl', cwd: 'C:/x' })
  await wait(w, 5)
  expect(w.sent[0]?.text).toBe('Hey Akash, help-drafting-email is asking permission to run `npm test`. Approve it on your machine, or reply no here to stop it.')
  w.threads[w.sent[0]!.ts] = [{ ts: '800.000', text: 'maybe', user: ME }]
  await wait(w, 0)
  expect(w.sent[1]?.text).toBe('Reply no to stop it, or approve it on your machine.')
  w.threads[w.sent[0]!.ts]!.push({ ts: '801.000', text: 'yes', user: ME })
  await wait(w, 0)
  expect(w.sent[2]?.text).toContain('"Bash(npm test)"')
  expect(w.aborted).toEqual([])
  expect(w.submitted).toEqual([])
  w.threads[w.sent[0]!.ts]!.push({ ts: '802.000', text: 'no', user: ME })
  await wait(w, 0)
  expect(w.aborted).toEqual(['t9'])
  expect(w.submitted[0]?.text).toContain('denied `npm test` from Slack')
})

test('a plain message in the DM goes to the waiting session, which says so', async ($, on) => {
  const w = engine(on)
  await start($)
  await finish($, 'Done.')
  await wait(w, 5)
  w.top = [{ ts: '900.000', text: 'next do the tests', user: ME }]
  await wait(w, 0)
  expect(w.sent[1]).toEqual({ text: '→ help-drafting-email', thread: '900.000', ts: w.sent[1]!.ts })
  expect(w.submitted).toEqual([{ text: 'next do the tests', asUser: true }])
})

test('without Slack the ping is a push to the Claude app', async ($, on) => {
  const w = engine(on, {}, false)
  await start($)
  await finish($, 'Done.')
  await wait(w, 5)
  expect(w.pushes).toEqual(['help-drafting-email has finished and is waiting for you.'])
})
