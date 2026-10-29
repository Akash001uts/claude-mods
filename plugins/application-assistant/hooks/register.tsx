import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Config, Reminder } from '../types'

// Reminders due within this many days show above the prompt.
const SOON_DAYS = 7
const MAX_ROWS = 3

export const SET_UP = 'Set it up now'
export const LATER = 'Later'

const reminders = atom({ plugin: 'application-assistant', key: 'reminders' } as const, [])
const isHere = atom({ plugin: 'application-assistant', key: 'isHere' } as const, false)

async function home($: EngineInterface) {
  return ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
}

// Everything the skills write lives here; the mod only reads it.
const dirOf = async ($: EngineInterface) => `${((await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}/.claude`).replace(/\\/g, '/')}/application-assistant`

async function readJson<T>($: EngineInterface, path: string): Promise<T | undefined> {
  const text = await $.fs.read(path).catch(() => '')
  try {
    return text ? (JSON.parse(text) as T) : undefined
  } catch {
    return undefined
  }
}

const same = (a: string, b: string) => a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000)

export const when = (due: string, today: string) => {
  const n = daysBetween(today, due)
  return n < 0 ? `${-n}d overdue` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n}d`
}

// Due within SOON_DAYS (or overdue), soonest first.
export const soon = (all: readonly Reminder[], today: string) =>
  all.filter(r => !r.done && daysBetween(today, r.due) <= SOON_DAYS).sort((a, b) => a.due.localeCompare(b.due))

// The scan should have run today once its time has passed: a missed or failed one is said, never hidden.
export function scanState(c: Config, nowMs: number): 'ok' | 'missed' | 'failed' {
  if (c.lastScanOk === false) return 'failed'
  const today = dayOf(nowMs)
  const [hour = 8, min = 0] = (c.scanTime ?? '08:00').split(':').map(Number)
  const due = new Date(nowMs)
  due.setHours(hour, min, 0, 0)
  if (!c.lastScan) return nowMs >= due.getTime() ? 'missed' : 'ok'
  const last = dayOf(Date.parse(c.lastScan))
  if (last === today) return 'ok'
  return nowMs >= due.getTime() || daysBetween(last, today) > 1 ? 'missed' : 'ok'
}

// What /apply's sub-commands ask Claude to do: each runs one of the mod's skills.
const SKILLS: Record<string, { skill: string; what: string }> = {
  check: { skill: 'check', what: 'Scan for new roles, sweep my inbox for replies, update my tracker and show me a short table of what changed.' },
  ready: { skill: 'ready', what: 'Run the pre-submit check for this role:' },
  fill: { skill: 'fill', what: 'Fill the application form in Chrome for this role, and stop before submit:' },
  setup: { skill: 'setup', what: 'Set up or edit my application-assistant profile.' },
  review: { skill: 'review', what: 'Run my weekly application review now.' },
}

const HELP = [
  '/apply                 rundown: new roles, what is due, follow-ups',
  '/apply check           scan for roles, sweep your inbox, update the tracker',
  '/apply <link>          check a role and build its application pack',
  '/apply ready <role>    the 7-point pre-submit check',
  '/apply fill <role>     fill the form in Chrome (you review and submit)',
  '/apply review          weekly review now',
  '/apply setup           set up or edit your profile',
].join('\n')

async function refresh($: EngineInterface) {
  const dir = await dirOf($)
  const list = (await readJson<Reminder[]>($, `${dir}/reminders.json`)) ?? []
  await update($, reminders, () => list)
  const c = await readJson<Config>($, `${dir}/config.json`)
  const root = await $.session.root()
  await update($, isHere, () => Boolean(c?.applicationsDir && same(root, c.applicationsDir)))
  return c
}

async function rundown($: EngineInterface, c: Config) {
  const now = await $.clock.now()
  const today = dayOf(now)
  const lines: string[] = []
  const state = scanState(c, now)
  if (state === 'failed') lines.push(`⚠ The last scan failed${c.lastScanError ? `: ${c.lastScanError}` : ''}. /apply check runs it again.`)
  if (state === 'missed') lines.push('⚠ Today\'s scan hasn\'t run (the scheduled routine missed it). Scanning now.')
  if (c.newRoles !== undefined) lines.push(`${c.newRoles} new role${c.newRoles === 1 ? '' : 's'} in the last digest${c.lastDigest ? ` (${c.lastDigest})` : ''}.`)
  const due = soon((await read($, reminders)) as Reminder[], today)
  for (const r of due) lines.push(`${r.kind === 'followup' ? '↩' : '•'} ${r.what}: ${when(r.due, today)}`)
  if (c.weeklyReview && new Date(now).toLocaleDateString('en-AU', { weekday: 'long' }).toLowerCase() === c.weeklyReview.toLowerCase() && c.lastReview !== today)
    lines.push(`It's ${c.weeklyReview}: /apply review for the weekly review.`)
  return { text: lines.join('\n'), isMissed: state === 'missed' }
}

// A prompt can't be submitted from inside the command's own hook (it would wait on the turn the hook holds), so it
// goes from a timer, just after.
const later = ($: EngineInterface, text: string) => void $.clock.after(0, () => void $.prompt.submit({ text }).catch(() => {}))

const NUDGE = (skill: string, what: string, args = '') =>
  `Use the application-assistant:${skill} skill. ${what}${args ? ` ${args}` : ''}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'apply', description: 'Job applications: rundown, scan and inbox sweep, check a role and build its pack, pre-submit check, form fill', argumentHint: '[check | <link> | ready <role> | fill <role> | review | setup]' })
    const started = await next(e)
    if (!e.isInteractive) return started
    const c = await refresh($).catch(() => undefined)
    if (!c) {
      if (await $.store.get('offered')) return started
      await $.store.set('offered', true)
      void $.ui
        .ask('application-assistant helps you find roles, check them against your situation, build application packs and keep a tracker. Set up your profile now? It takes a short interview.', {
          header: 'Applications',
          options: [SET_UP, LATER],
        })
        .then(async a => {
          if (a === SET_UP) await $.prompt.submit({ text: NUDGE('setup', SKILLS.setup!.what) })
          else $.ui.log('application-assistant: /apply setup whenever you\'re ready.')
        })
        .catch(() => {})
      return started
    }
    // Only in the applications folder: the rundown, and the fallback scan when the scheduled one didn't run.
    if (!(await read($, isHere))) return started
    const r = await rundown($, c)
    if (r.text) $.ui.log(`application-assistant\n${r.text}`)
    if (r.isMissed) void $.prompt.submit({ text: NUDGE('check', 'The scheduled scan didn\'t run today, so scan now (roles only, then the inbox sweep), and update the tracker.') }).catch(() => {})
    return started
  })

  on('command.run', { command: 'apply' }, async ($, e) => {
    const args = e.args.trim()
    const [word = '', ...rest] = args.split(/\s+/)
    const c = await refresh($).catch(() => undefined)
    if (!args) {
      if (!c) return { text: `application-assistant isn't set up yet: /apply setup.\n\n${HELP}` }
      const r = await rundown($, c)
      return { text: `${r.text || 'Nothing new and nothing due.'}\n\n${HELP}` }
    }
    if (word.toLowerCase() === 'help') return { text: HELP }
    if (!c && word.toLowerCase() !== 'setup') return { text: 'Set up first: /apply setup.' }
    if (/^https?:\/\//i.test(word)) {
      later($, NUDGE('role', 'Check this role against my profile and, if it fits, build its application pack:', word))
      return { text: `Checking ${word}.` }
    }
    const sub = SKILLS[word.toLowerCase()]
    if (!sub) return { text: `Unknown: /apply ${word}\n\n${HELP}` }
    if ((word === 'ready' || word === 'fill') && rest.length === 0) return { text: `Usage: /apply ${word} <role>` }
    later($, NUDGE(sub.skill, sub.what, rest.join(' ')))
    return { text: `Running ${word}.` }
  })

  // Due dates and follow-ups, above the prompt in the applications folder.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const all = (await read($, reminders)) as Reminder[]
    if (e.props.hasSurvey || !(await read($, isHere)) || all.length === 0) return next(e)
    const today = dayOf(await $.clock.now())
    const due = soon(all, today)
    if (due.length === 0) return next(e)
    const beneath = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const shown = due.slice(0, MAX_ROWS)
    return (
      <Box flexDirection="column">
        {shown.map(r => (
          <Text wrap="truncate">
            <Text color={daysBetween(today, r.due) <= 1 ? 'warning' : 'suggestion'}>{r.kind === 'followup' ? '↩ ' : '⏰ '}</Text>
            {r.what} <Text dimColor>{when(r.due, today)}</Text>
          </Text>
        ))}
        {due.length > MAX_ROWS && <Text dimColor>   +{due.length - MAX_ROWS} more (/apply)</Text>}
        {beneath}
      </Box>
    )
  })
}
