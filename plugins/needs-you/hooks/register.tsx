import type { EngineInterface, Register } from 'claude-code'

import type { Settings } from '../types'
import { SLACK, field, isNo, isYes, messages, parsed, pick, pingText, plain } from './slack'
import type { Message, Question } from './slack'

export const KINDS = ['Finished turns', 'Permission prompts', 'Questions', 'Permission counter'] as const
const DEFAULTS: Settings = { turns: false, permissions: false, questions: false, counter: false, waitMin: 5 }
// How often the mod checks for pings due and for replies in the DM.
const TICK = 10_000
// A ping answered on the machine still gets "Already answered" to a Slack reply for this long.
const CLOSED_FOR = 30 * 60_000
// Approvals of the same command before an allow rule is suggested.
const SUGGEST_AT = 3

type Kind = 'turn' | 'permission' | 'question'
type Wait = { id: string; kind: Kind; since: number; text: string; tool?: string; input?: unknown; questions?: Question[]; pingTs?: string; byPhone?: true }
// A ping, as every session sees it in the shared store: which session it belongs to, so a plain message in the DM
// goes to the most recent session still waiting.
type Ping = { sessionId: string; at: number; session: string }

// This session's waits, by tool_use_id ('turn' for a finished turn).
const waits = new Map<string, Wait>()
let turnId: string | undefined
// The call the person allowed from Slack, allowed once when Claude runs it again.
let allowOnce: string | undefined
// Calls that raised a permission prompt, by tool_use_id, with the allow rule they'd need.
const asked = new Map<string, string>()
let slack: { server: string } | null | undefined
let me: { id: string; name: string; channel?: string } | undefined
const closed = new Map<string, number>()
const ours = new Set<string>()
let isTicking = false
let hasTimer = false

const get = async ($: EngineInterface) => ({ ...DEFAULTS, ...((await $.store.get('settings')) as Partial<Settings> | undefined) })
const put = async ($: EngineInterface, s: Settings) => $.store.set('settings', s)
const keyOf = (tool: string, input: unknown) => `${tool}\n${JSON.stringify(input)}`
export const ruleOf = (tool: string, input: unknown) => {
  const command = (input as { command?: unknown } | undefined)?.command
  return (tool === 'Bash' || tool === 'PowerShell') && typeof command === 'string' ? `${tool}(${command})` : tool
}
const describe = (tool: string, input: unknown) => {
  const i = (input ?? {}) as Record<string, unknown>
  const main = i.command ?? i.file_path ?? i.url ?? i.pattern
  return typeof main === 'string' ? (tool === 'Bash' || tool === 'PowerShell' ? main : `${tool} ${main}`) : tool
}

// The Slack connector's server, found by its send tool; null when it isn't connected.
async function findSlack($: EngineInterface) {
  if (slack !== undefined) return slack
  const tool = (await $.tool.list().catch(() => [])).find(t => t.mcp && t.name.endsWith(`__${SLACK.send}`))
  slack = tool ? { server: tool.name.slice('mcp__'.length, tool.name.lastIndexOf(`__${SLACK.send}`)) } : null
  return slack
}

async function call($: EngineInterface, tool: string, args: Record<string, unknown>) {
  const s = await findSlack($)
  if (!s) throw new Error('Slack is not connected')
  const r = await $.mcp.call(s.server, tool, args)
  if (r.isError) throw new Error(`${tool} failed`)
  return parsed(r.content as { type: string; text?: string }[], r.structuredContent)
}

// You, from your Slack profile: the user id replies must come from, and the first name the DM greets.
async function whoAmI($: EngineInterface) {
  if (me) return me
  const saved = (await $.store.get('me')) as typeof me
  if (saved) return (me = saved)
  const got = await call($, SLACK.profile, {})
  const id = field(got, ['user_id', 'id'])
  if (!id || !/^[UW][A-Z0-9]+$/.test(id)) throw new Error('could not read your Slack user')
  const name = (field(got, ['first_name', 'display_name', 'real_name', 'name']) ?? 'there').split(/\s+/)[0]!
  me = { id, name }
  await $.store.set('me', me)
  return me
}

// Posts in your own DM (in a thread when `threadTs` is given) and returns the message's ts.
async function send($: EngineInterface, text: string, threadTs?: string) {
  const who = await whoAmI($)
  const got = await call($, SLACK.send, { channel_id: who.channel ?? who.id, message: text, ...(threadTs && { thread_ts: threadTs }) })
  const ts = field(got, ['ts', 'message_ts'])
  const channel = field(got, ['channel', 'channel_id'])
  if (channel && /^D[A-Z0-9]+$/.test(channel) && who.channel !== channel) {
    me = { ...who, channel }
    await $.store.set('me', me)
  }
  if (ts) ours.add(ts)
  return ts
}

async function sessionName($: EngineInterface) {
  return (await $.session.root()).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'Claude'
}

async function ping($: EngineInterface, w: Wait) {
  const session = await sessionName($)
  if (await findSlack($)) {
    const name = (await whoAmI($)).name
    const text =
      w.kind === 'turn' ? pingText.turn(name, session, w.text) : w.kind === 'permission' ? pingText.permission(name, session, w.text) : pingText.question(name, session, w.questions ?? [])
    w.pingTs = await send($, text)
    if (w.pingTs) {
      const pings = ((await $.store.get('pings')) as Record<string, Ping> | undefined) ?? {}
      pings[w.pingTs] = { sessionId: await $.session.id(), at: await $.clock.now(), session }
      await $.store.set('pings', pings)
    }
    return
  }
  // Without Slack, Claude Code's own push to the Claude app (one way; needs Remote Control on).
  const short = w.kind === 'turn' ? `${session} has finished and is waiting for you.` : w.kind === 'permission' ? `${session} is asking permission to run ${w.text.slice(0, 80)}.` : `${session} has a question for you.`
  await $.tool.call({ tool: 'PushNotification', message: short, status: 'proactive' } as Parameters<EngineInterface['tool']['call']>[0]).catch(() => undefined)
  w.pingTs = 'push'
}

// A wait ended on the machine: its ping is closed, and a late Slack reply hears that.
async function close($: EngineInterface, w: Wait | undefined) {
  if (!w) return
  waits.delete(w.id)
  if (!w.pingTs || w.pingTs === 'push') return
  const pings = ((await $.store.get('pings')) as Record<string, Ping> | undefined) ?? {}
  delete pings[w.pingTs]
  await $.store.set('pings', pings)
  if (!w.byPhone) closed.set(w.pingTs, (await $.clock.now()) + CLOSED_FOR)
}

async function handled($: EngineInterface, ts: string) {
  const all = ((await $.store.get('handled')) as string[] | undefined) ?? []
  if (all.includes(ts)) return true
  await $.store.set('handled', [...all, ts].slice(-300))
  return false
}

async function abort($: EngineInterface) {
  if (turnId) await $.turn.abort({ turnId }).catch(() => undefined)
}

// A reply from you, for one wait. First answer wins: the wait is gone once the machine answers.
export async function answer($: EngineInterface, w: Wait, reply: string) {
  const text = plain(reply)
  if (w.kind === 'turn') {
    w.byPhone = true
    await close($, w)
    await $.prompt.submit({ text, asUser: true })
    return
  }
  if (w.kind === 'permission') {
    const yes = isYes(text)
    if (!yes && !isNo(text)) {
      if (w.pingTs) await send($, 'Reply yes or no.', w.pingTs)
      return
    }
    w.byPhone = true
    if (yes) allowOnce = keyOf(w.tool!, w.input)
    await close($, w)
    // Claude Code's own permission box can't be answered by a mod, so the turn stops (closing the box) and Claude is
    // told the answer, with that one call allowed when it runs it again.
    await abort($)
    await $.prompt.submit({
      text: yes
        ? `needs-you: The user approved \`${w.text}\` from Slack. Run it again now.`
        : `needs-you: The user denied \`${w.text}\` from Slack. Don't run it. Carry on another way, or stop and say what you need.`,
    })
    return
  }
  w.byPhone = true
  await close($, w)
  await abort($)
  const options = w.questions?.[0]?.options ?? []
  const picked = pick(text, options)
  await $.prompt.submit({
    text: `needs-you: The user answered your question from Slack${picked ? `, picking "${picked}"` : ''}: ${text}`,
  })
}

const fromMe = (m: Message, who: { id: string }) => m.user === who.id && !m.isBot && !ours.has(m.ts)

// Checks the DM for your replies: in each ping's thread, a late reply to a closed one, and plain messages.
async function poll($: EngineInterface) {
  const who = await whoAmI($)
  const channel = who.channel ?? who.id
  const now = await $.clock.now()
  for (const w of [...waits.values()].filter(x => x.pingTs && x.pingTs !== 'push')) {
    const replies = messages(await call($, SLACK.thread, { channel_id: channel, message_ts: w.pingTs })).filter(m => m.ts !== w.pingTs && fromMe(m, who))
    for (const m of replies) {
      if (await handled($, m.ts)) continue
      await answer($, w, m.text)
      break
    }
  }
  for (const [ts, until] of closed) {
    if (now > until) {
      closed.delete(ts)
      continue
    }
    const late = messages(await call($, SLACK.thread, { channel_id: channel, message_ts: ts })).filter(m => m.ts !== ts && fromMe(m, who))
    for (const m of late) if (!(await handled($, m.ts))) await send($, 'Already answered on your machine.', ts)
  }
  // A plain message in the DM goes to the most recent session still waiting; only that session takes it.
  const pings = ((await $.store.get('pings')) as Record<string, Ping> | undefined) ?? {}
  const latest = Object.entries(pings).sort((a, b) => b[1].at - a[1].at)[0]
  const sessionId = await $.session.id()
  if (!latest || latest[1].sessionId !== sessionId) return
  const w = [...waits.values()].find(x => x.pingTs === latest[0])
  if (!w) return
  const top = messages(await call($, SLACK.channel, { channel_id: channel, limit: 20 })).filter(m => !m.threadTs && Number(m.ts) > Number(latest[0]) && fromMe(m, who))
  for (const m of top.sort((a, b) => Number(a.ts) - Number(b.ts))) {
    if (await handled($, m.ts)) continue
    await send($, `→ ${latest[1].session}`, m.ts)
    await answer($, w, m.text)
    break
  }
}

async function tick($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  try {
    const s = await get($)
    const now = await $.clock.now()
    for (const w of waits.values()) if (!w.pingTs && now - w.since >= s.waitMin * 60_000) await ping($, w).catch(() => undefined)
    const isListening = [...waits.values()].some(w => w.pingTs && w.pingTs !== 'push') || closed.size > 0
    if (isListening && (await findSlack($))) await poll($).catch(() => undefined)
  } finally {
    isTicking = false
  }
}

async function setup($: EngineInterface) {
  await $.store.set('asked', true)
  const picked = await $.ui.ask(
    'When should needs-you message you on Slack? After Claude has waited on you for 5 minutes: a finished turn, a permission prompt, a question. The counter suggests allow rules for commands you approve every time.',
    { header: 'Needs-you', options: [...KINDS], multiSelect: true },
  )
  const on = picked.split(',').map(p => p.trim())
  const s: Settings = { ...(await get($)), turns: on.includes(KINDS[0]), permissions: on.includes(KINDS[1]), questions: on.includes(KINDS[2]), counter: on.includes(KINDS[3]) }
  await put($, s)
  $.ui.log(`needs-you: ${status(s)}\n${await slackLine($)}`)
}

async function slackLine($: EngineInterface) {
  const s = await findSlack($)
  if (!s)
    return 'Slack isn\'t connected, so pings go to the Claude app as a push instead (one way, needs Remote Control on). To use Slack: claude.ai > Settings > Connectors > Slack, then start a new session.'
  const tools = Object.values(SLACK).map(t => `"mcp__${s.server}__${t}"`).join(', ')
  return `Slack is connected. So a ping never raises its own permission prompt, add these to "permissions.allow" in ~/.claude/settings.json: ${tools}. /needs-you test sends a test message.`
}

const status = (s: Settings) => {
  const on = [s.turns && 'finished turns', s.permissions && 'permission prompts', s.questions && 'questions', s.counter && 'permission counter'].filter(Boolean)
  return `${on.length ? `${on.join(', ')} on` : 'everything off'}; pings after ${s.waitMin} minute${s.waitMin === 1 ? '' : 's'} of waiting.`
}

const HELP = [
  '/needs-you                                           what is on',
  '/needs-you turns|permissions|questions|counter on|off',
  '/needs-you wait <minutes>                            how long Claude waits before a ping (default 5)',
  '/needs-you test                                      send a test message to your Slack DM',
  '/needs-you setup                                     ask the first-run questions again',
].join('\n')

async function needsYouCommand($: EngineInterface, args: string) {
  const s = await get($)
  const [word = '', rest = ''] = args.trim().toLowerCase().split(/\s+/)
  if (!word || word === 'help') return `needs-you: ${status(s)}\n${await slackLine($)}\n\n${HELP}`
  if (word === 'setup') {
    void setup($).catch(() => {})
    return 'Asking the setup questions.'
  }
  if (word === 'test') {
    if (!(await findSlack($))) return await slackLine($)
    const ts = await send($, `needs-you test from ${await sessionName($)}: if you can read this, pings will reach you here.`).catch((err: unknown) => `failed: ${String(err)}`)
    return ts?.startsWith('failed') ? `The test message ${ts}` : 'Sent a test message to your Slack DM.'
  }
  if (word === 'wait') {
    const n = Number(rest)
    if (!Number.isFinite(n) || n < 1) return 'Usage: /needs-you wait <minutes>'
    await put($, { ...s, waitMin: Math.round(n) })
    return `Pings go out after ${Math.round(n)} minute${Math.round(n) === 1 ? '' : 's'} of waiting.`
  }
  const keys = { turns: 'turns', permissions: 'permissions', questions: 'questions', counter: 'counter' } as const
  const key = keys[word as keyof typeof keys]
  if (!key || (rest !== 'on' && rest !== 'off')) return `Unknown: /needs-you ${args.trim()}\n\n${HELP}`
  await put($, { ...s, [key]: rest === 'on' })
  return `${key[0]!.toUpperCase()}${key.slice(1)} ${rest}.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'needs-you', description: 'Slack DM when Claude has waited on you for a while; reply there to carry on', argumentHint: '[turns|permissions|questions|counter on|off | wait <minutes> | test | setup]' })
    const started = await next(e)
    if (!hasTimer) {
      hasTimer = true
      $.clock.every(TICK, () => void tick($).catch(() => {}))
    }
    if (e.isInteractive && !(await $.store.get('asked'))) void setup($).catch(() => {})
    return started
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turnId = e.turnId
      await close($, waits.get('turn'))
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId || e.reason !== 'answer' || !e.answer.trim()) return done
    if ((await get($)).turns) waits.set('turn', { id: 'turn', kind: 'turn', since: await $.clock.now(), text: e.answer })
    return done
  })

  // Typing on the machine answers a finished turn.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer') await close($, waits.get('turn'))
    return next(e)
  }).catch(($, e, next) => next(e))

  // A permission prompt: Claude Code shows its own box; the wait starts. A call allowed from Slack is allowed once
  // when Claude runs it again.
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'ask' || e.approver !== 'person' || e.agentId || e.tool === 'AskUserQuestion') return verdict
    if (allowOnce && allowOnce === keyOf(e.tool, e.input)) {
      allowOnce = undefined
      return { decision: 'allow', reason: 'Allowed from Slack by the user (needs-you).' }
    }
    if (!e.tool_use_id) return verdict
    const s = await get($)
    if (s.counter) asked.set(e.tool_use_id, ruleOf(e.tool, e.input))
    if (s.permissions)
      waits.set(e.tool_use_id, { id: e.tool_use_id, kind: 'permission', since: await $.clock.now(), text: describe(e.tool, e.input), tool: e.tool, input: e.input })
    return verdict
  })

  // A question waits while its box is up. Any call's end closes its wait; an approved prompt counts toward an allow
  // rule.
  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id
    if (String(e.tool) === 'AskUserQuestion' && !e.agentId && (await get($)).questions)
      waits.set(id, { id, kind: 'question', since: await $.clock.now(), text: '', questions: (e as unknown as { questions: Question[] }).questions })
    const result = await next(e)
    await close($, waits.get(id))
    const rule = asked.get(id)
    if (rule) {
      asked.delete(id)
      if (result.deny === undefined) {
        const counts = ((await $.store.get('counts')) as Record<string, number> | undefined) ?? {}
        counts[rule] = (counts[rule] ?? 0) + 1
        await $.store.set('counts', counts)
        const told = ((await $.store.get('suggested')) as string[] | undefined) ?? []
        if (counts[rule] >= SUGGEST_AT && !told.includes(rule)) {
          await $.store.set('suggested', [...told, rule])
          $.ui.log(`needs-you: you've approved ${rule} ${counts[rule]} times. To stop being asked, add "${rule.replace(/"/g, '\\"')}" to "permissions.allow" in ~/.claude/settings.json (or .claude/settings.json for this project only).`)
        }
      }
    }
    return result
  }).catch(($, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    for (const w of [...waits.values()]) await close($, w).catch(() => undefined)
    return next(e)
  })

  on('command.run', { command: 'needs-you' }, async ($, e) => ({ text: await needsYouCommand($, e.args) }))
}
