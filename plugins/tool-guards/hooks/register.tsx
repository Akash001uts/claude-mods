import type { EngineInterface, Register } from 'claude-code'

import type { Settings } from '../types'
import { hasAttribution, isCommitOrPr, messageFile, strip, writes } from './guards'

export const GUARDS = ['Shell edits', 'Attribution', 'Big reads'] as const
export const NOTE = 'Show me a note'
export const NO_NOTE = 'No notes'

// A read that would take this share of the context left gets asked about first.
const SHARE = 0.25
// Rough characters per token, for sizing a read from its bytes.
const CHARS_PER_TOKEN = 4
// Files the Read tool doesn't read as text, so their size says nothing about tokens.
const NOT_TEXT = /\.(png|jpe?g|gif|webp|bmp|ico|pdf|ipynb|zip|gz|exe|dll|so|dylib|bin)$/i

const DEFAULTS: Settings = { edits: false, attribution: false, reads: false, isLoud: false, editsScope: 'always', attributionMode: 'fix' }

const EDIT_REASON = 'tool-guards: Use the Edit or Write tool for file changes, so they can be undone with /rewind. This command writes'
const ATTRIBUTION_REASON =
  'tool-guards: Remove the attribution lines (Co-Authored-By: Claude, "Generated with Claude Code", the claude.ai session link) and run it again.'

// The permission mode the session is in, as the settings hooks last reported it.
let mode = ''

const get = async ($: EngineInterface) => ({ ...DEFAULTS, ...((await $.store.get('settings')) as Partial<Settings> | undefined) })
const put = async ($: EngineInterface, s: Settings) => $.store.set('settings', s)
const tell = (s: Settings, $: EngineInterface, text: string) => {
  if (s.isLoud) $.ui.toast(`tool-guards: ${text}`)
}

async function setup($: EngineInterface) {
  await $.store.set('asked', true)
  const picked = await $.ui.ask(
    'Which tool guards should be on? Shell edits: Claude must use Edit or Write so /rewind works. Attribution: no Co-Authored-By, "Generated with Claude Code" or session links in your commits and PRs. Big reads: asks you before a read that would take a quarter of the context left.',
    { header: 'Guards', options: [...GUARDS], multiSelect: true },
  )
  const chosen = picked.split(',').map(p => p.trim())
  const note = await $.ui.ask('Show a note when a guard steps in?', { header: 'Notes', options: [NOTE, NO_NOTE] })
  const s: Settings = { ...(await get($)), edits: chosen.includes(GUARDS[0]), attribution: chosen.includes(GUARDS[1]), reads: chosen.includes(GUARDS[2]), isLoud: note === NOTE }
  await put($, s)
  $.ui.log(`tool-guards: ${status(s)}\n/guards shows the commands.`)
}

const status = (s: Settings) => {
  const parts = [
    s.edits && `shell edits (${s.editsScope === 'auto' ? 'auto mode only' : 'every mode'})`,
    s.attribution && `attribution (${s.attributionMode === 'fix' ? 'fixed quietly' : 'refused'})`,
    s.reads && 'big reads',
  ].filter(Boolean)
  return `${parts.length ? `${parts.join(', ')} on` : 'every guard off'}; notes ${s.isLoud ? 'shown' : 'hidden'}.`
}

const HELP = [
  '/guards                                  what is on',
  '/guards edits|attribution|reads on|off   turn a guard on or off',
  '/guards edits auto | always              shell edits caught in auto mode only, or in every mode',
  '/guards attribution fix | refuse         take the lines out quietly, or refuse the commit',
  '/guards quiet | loud                     hide or show a note when a guard steps in',
  '/guards setup                            ask the first-run questions again',
].join('\n')

async function guardsCommand($: EngineInterface, args: string) {
  const s = await get($)
  const [word = '', rest = ''] = args.trim().toLowerCase().split(/\s+/)
  if (!word || word === 'help') return `tool-guards: ${status(s)}\n\n${HELP}`
  if (word === 'setup') {
    void setup($).catch(() => {})
    return 'Asking the setup questions.'
  }
  if (word === 'quiet' || word === 'loud') {
    await put($, { ...s, isLoud: word === 'loud' })
    return word === 'loud' ? 'A note shows when a guard steps in.' : 'Guards step in without a note.'
  }
  const keys = { edits: 'edits', attribution: 'attribution', reads: 'reads' } as const
  const key = keys[word as keyof typeof keys]
  if (!key) return `Unknown: /guards ${word}\n\n${HELP}`
  if (rest === 'on' || rest === 'off') {
    await put($, { ...s, [key]: rest === 'on' })
    return `${{ edits: 'Shell edits', attribution: 'Attribution', reads: 'Big reads' }[key]} guard ${rest}.`
  }
  if (key === 'edits' && (rest === 'auto' || rest === 'always')) {
    await put($, { ...s, edits: true, editsScope: rest })
    return rest === 'auto' ? 'Shell edits are caught in auto mode only.' : 'Shell edits are caught in every mode.'
  }
  if (key === 'attribution' && (rest === 'fix' || rest === 'refuse')) {
    await put($, { ...s, attribution: true, attributionMode: rest })
    return rest === 'fix' ? 'Attribution lines are taken out quietly.' : 'A commit or PR with attribution lines is refused.'
  }
  return HELP
}

// Tokens left before the window is full, or undefined when the session hasn't measured it yet.
async function left($: EngineInterface) {
  const { context } = await $.session.usage()
  return context.tokens === undefined ? undefined : Math.max(1, context.window - context.tokens)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'guards', description: 'Tool guards: shell edits, attribution in commits and PRs, big reads', argumentHint: '[edits|attribution|reads on|off | edits auto|always | attribution fix|refuse | quiet | loud]' })
    const started = await next(e)
    if (e.isInteractive && !(await $.store.get('asked'))) void setup($).catch(() => {})
    return started
  })

  // The permission mode rides on the settings hooks' events; the latest one is the mode in force.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.permission_mode) mode = e.permission_mode
    return next(e)
  })
  on('classic.PostToolUse', async ($, e, next) => {
    if (e.permission_mode) mode = e.permission_mode
    return next(e)
  })

  // The source of the attribution: Claude Code tells Claude to add these lines. With the guard on, it's told nothing.
  on('attribution.text', async ($, e, next) => {
    const s = await get($)
    if (s.attribution && (e.kind === 'commit' || e.kind === 'pr')) return { text: '' }
    return next(e)
  })

  // Shell commands: file writes are refused, attribution in a commit or PR is taken out (or refused), and a huge
  // output gets a note for Claude after it runs.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (tool !== 'Bash' && tool !== 'PowerShell') return next(e)
    const original = String((e as { command?: unknown }).command ?? '')
    let command = original
    let s: Settings
    // A check that fails refuses the command rather than letting it through unchecked.
    try {
      s = await get($)

      if (s.edits && (s.editsScope === 'always' || mode === 'auto')) {
        const targets = writes(command)
        if (targets.length) {
          tell(s, $, `stopped a shell write to ${targets[0]}; Claude will use Edit instead`)
          return { deny: `${EDIT_REASON} ${targets.join(', ')}. Shell writes into temp or scratch folders are fine.` }
        }
      }

      if (s.attribution && isCommitOrPr(command)) {
        const file = messageFile(command)
        const fromFile = file ? await $.fs.read(file).catch(() => '') : ''
        if (hasAttribution(fromFile)) {
          tell(s, $, 'refused a commit whose message file has attribution lines')
          return { deny: `${ATTRIBUTION_REASON} They are in ${file}.` }
        }
        if (hasAttribution(command)) {
          const fixed = s.attributionMode === 'fix' ? strip(command) : undefined
          if (fixed === undefined) {
            tell(s, $, 'refused a commit with attribution lines')
            return { deny: ATTRIBUTION_REASON }
          }
          tell(s, $, 'took the attribution lines out of a commit')
          command = fixed
        }
      }
    } catch {
      return { deny: 'tool-guards could not check this command; try again.' }
    }

    const ran = await next(command === original ? e : ({ ...e, command } as typeof e))
    // A slip in the size note never costs Claude the output.
    try {
      if (!s.reads || ran.deny !== undefined || !ran.text) return ran
      const room = await left($).catch(() => undefined)
      const tokens = Math.ceil(ran.text.length / CHARS_PER_TOKEN)
      if (room === undefined || tokens < room * SHARE) return ran
      const pct = Math.round((tokens / room) * 100)
      tell(s, $, `that output took about ${pct}% of the context left`)
      return {
        ...ran,
        context: [
          ...(ran.context ?? []),
          `tool-guards: That output took about ${pct}% of the context you had left. For the rest of this session, narrow commands down first (head, tail, grep, a line range) before printing a lot.`,
        ],
      }
    } catch {
      return ran
    }
  })

  // Big reads: before a file read that would take a quarter or more of the context left, ask the person.
  on('tool.check', { tool: 'Read' }, async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny' || e.approver !== 'person' || e.agentId) return verdict
    const s = await get($)
    if (!s.reads) return verdict
    const input = e.input as { file_path?: string; offset?: number; limit?: number }
    if (!input.file_path || NOT_TEXT.test(input.file_path)) return verdict
    const stat = await $.fs.stat(input.file_path).catch(() => undefined)
    if (!stat || stat.kind !== 'file') return verdict
    // A line range reads part of the file: about 80 characters a line, never more than the file.
    const chars = input.limit ? Math.min(stat.size, input.limit * 80) : stat.size
    const tokens = Math.ceil(chars / CHARS_PER_TOKEN)
    const room = await left($).catch(() => undefined)
    if (room === undefined || tokens < room * SHARE) return verdict
    const pct = Math.round((tokens / room) * 100)
    tell(s, $, `asked before a read of about ${pct}% of the context left`)
    return {
      decision: 'ask',
      reason: `This read will take about ${pct}% of the context you have left (about ${Math.round(tokens / 1000)}k tokens). Go ahead? If not, Claude reads a range or searches instead.`,
    }
  })

  on('command.run', { command: 'guards' }, async ($, e) => ({ text: await guardsCommand($, e.args) }))
}
