import type { EngineInterface, Register } from 'claude-code'

import type { Settings } from '../types'
import { BUILT_IN, LANGUAGES, banned, commentRate, errorKey, languageOf, verifies } from './checks'

export const PARTS = ['Loop detector', 'Done-check', 'Style guard'] as const
export const ONLY_CLAUDE = 'Only Claude'
export const BOTH = 'Claude and me'

const DEFAULTS: Settings = { loop: false, done: false, style: false, isLoud: false, threshold: 1, fix: 'headsup', unbanned: [], bans: [] }

const LOOP_NOTE =
  'course-correct: This is the same error as before your last fix. Stop editing. Explain what is actually going wrong, give two different approaches, then pick one.'
const REDO_NOTE =
  'course-correct: You have made this exact edit to this file before, so you are going in circles. Stop editing. Explain what is actually going wrong, give two different approaches, then pick one.'
const DONE_NOTE =
  'course-correct: You said this works, but nothing has run since the files changed. Run it (tests, a build or the program itself), or say clearly that it is untested.'

// What this session has seen. Module variables: a reload starts them over, which only means a missed nudge.
const errorsSeen = new Map<string, { edits: number; repeats: number }>()
const editsSeen = new Map<string, number>()
let edits = 0
// Files changed since the last command that verified them, by anyone (Claude, you, another tool).
let changed = new Set<string>()
// Coach's own follow-up started this turn: it isn't checked again, so a nudge can't loop.
let isNudgeTurn = false
let hasTests: boolean | undefined
// Style notes waiting to go in with your next message.
let pending: string[] = []

const get = async ($: EngineInterface) => ({ ...DEFAULTS, ...((await $.store.get('settings')) as Partial<Settings> | undefined) })
const put = async ($: EngineInterface, s: Settings) => $.store.set('settings', s)

const tell = (s: Settings, $: EngineInterface, toast: string) => {
  if (s.isLoud) $.ui.toast(`course-correct: ${toast}`)
}

const phrases = (s: Settings) => [...BUILT_IN.filter(p => !s.unbanned.includes(p.toLowerCase())), ...s.bans]

// A project with no tests has nothing to verify with, so the done-check stays out of it.
const TEST_DIRS = /^(tests?|__tests__|specs?|e2e|testing)$/i
const TEST_FILES = /^(pytest\.ini|tox\.ini|conftest\.py|(jest|vitest|playwright|karma)\.config\.\w+|Cargo\.toml|go\.mod|CMakeLists\.txt|pom\.xml|build\.gradle(\.kts)?|.+\.sln|phpunit\.xml(\.dist)?)$|\.(test|spec)\.\w+$|_test\.(go|py)$|^test_.+\.py$/i
export async function findTests($: EngineInterface, root: string) {
  const top = await $.fs.list(root).catch(() => [])
  if (top.some(f => (f.kind === 'dir' && TEST_DIRS.test(f.name)) || (f.kind === 'file' && TEST_FILES.test(f.name)))) return true
  const pkg = top.some(f => f.name === 'package.json') ? await $.fs.read(`${root}/package.json`).catch(() => '') : ''
  if (/"test"\s*:/.test(pkg)) return true
  // One level down (a monorepo's packages, src/), a limited number of folders.
  for (const dir of top.filter(f => f.kind === 'dir' && !f.name.startsWith('.') && f.name !== 'node_modules').slice(0, 40)) {
    const inner = await $.fs.list(`${root}/${dir.name}`).catch(() => [])
    if (inner.some(f => (f.kind === 'dir' && TEST_DIRS.test(f.name)) || (f.kind === 'file' && TEST_FILES.test(f.name)))) return true
    for (const sub of inner.filter(f => f.kind === 'dir').slice(0, 20)) {
      const deeper = await $.fs.list(`${root}/${dir.name}/${sub.name}`).catch(() => [])
      if (deeper.some(f => f.kind === 'dir' && TEST_DIRS.test(f.name))) return true
    }
  }
  return false
}

// The text an edit tool writes.
const written = (e: { tool: string; [k: string]: unknown }) => {
  if (e.tool === 'Write') return String(e.content ?? '')
  if (e.tool === 'Edit') return String(e.new_string ?? '')
  if (e.tool === 'MultiEdit') return ((e.edits as { new_string?: string }[] | undefined) ?? []).map(x => x.new_string ?? '').join('\n')
  if (e.tool === 'NotebookEdit') return String(e.new_source ?? '')
  return ''
}
// What tests and builds write themselves (output, caches, coverage, git's own files) isn't a change to verify.
const GENERATED = /[\\/](\.git|node_modules|dist|build|out|target|coverage|\.next|\.cache|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.venv|venv|bin|obj)[\\/]|\.(pyc|log|tsbuildinfo)$/i
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

// Commands that write files count as changes too (Claude through the shell, a formatter, a generator).
const WRITES = /(^|[^<2&])>{1,2}\s*(?!&|\/dev\/null|\$null|nul\b)\S|\b(sed|perl)\s+-i|\btee\b|\b(Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Remove-Item)\b|\b(mv|cp|rm|touch|git\s+(checkout|restore|apply|merge|rebase|pull|stash))\b|\b(prettier|black|gofmt|rustfmt)\b.*(--write|-w\b)?/i

async function setup($: EngineInterface) {
  await $.store.set('asked', true)
  const picked = await $.ui.ask('Which parts of course-correct should be on? It only adds notes; it never blocks or undoes anything. /coach turns parts on or off later.', {
    header: 'Coach',
    options: [...PARTS],
    multiSelect: true,
  })
  const chosen = picked.split(',').map(p => p.trim())
  const who = await $.ui.ask('Who should see course-correct\'s notes?', { header: 'Notes', options: [ONLY_CLAUDE, BOTH] })
  const s: Settings = {
    ...(await get($)),
    loop: chosen.includes(PARTS[0]),
    done: chosen.includes(PARTS[1]),
    style: chosen.includes(PARTS[2]),
    isLoud: who === BOTH,
  }
  await put($, s)
  $.ui.log(`course-correct: ${status(s)}\n/coach shows the commands.`)
}

const status = (s: Settings) => {
  const parts = [s.loop && 'loop detector', s.done && 'done-check', s.style && 'style guard'].filter(Boolean)
  const style = s.style
    ? ` Style: ${phrases(s).length} banned phrases, comments ${s.comments === undefined ? 'unlimited' : `≤ ${s.comments} per 10 lines`}, language ${s.language ?? 'any'}, ${s.fix === 'rewrite' ? 'rewrite at once' : 'heads-up'}.`
    : ''
  return `${parts.length ? `${parts.join(', ')} on` : 'everything off'}; notes to ${s.isLoud ? 'Claude and you' : 'Claude only'}; loop note after ${s.threshold} repeat${s.threshold === 1 ? '' : 's'}.${style}`
}

const HELP = [
  '/coach                          what is on',
  '/coach loop|done|style on|off   turn a part on or off',
  '/coach loop <n>                 repeats before the loop note (default 1)',
  '/coach quiet | loud             notes to Claude only, or to you too',
  '/coach ban "<phrase>"           add a phrase Claude should not use; /coach unban "<phrase>"; /coach bans',
  '/coach comments <n> | off       comment lines allowed per 10 lines of code',
  '/coach language <name> | off    the language replies should be in',
  '/coach rewrite | headsup        redo a slipped reply at once, or just tell Claude',
  '/coach setup                    ask the first-run questions again',
].join('\n')

async function command($: EngineInterface, args: string) {
  const s = await get($)
  const [word = '', ...more] = args.trim().split(/\s+/)
  const rest = more.join(' ').trim()
  const quoted = rest.replace(/^["'“”]|["'“”]$/g, '').trim()
  const parts = { loop: 'loop', done: 'done', style: 'style' } as const
  const w = word.toLowerCase()
  if (!w || w === 'help') return `course-correct: ${status(s)}\n\n${HELP}`
  if (w === 'setup') {
    void setup($).catch(() => {})
    return 'Asking the setup questions.'
  }
  if (w in parts) {
    const key = parts[w as keyof typeof parts]
    if (key === 'loop' && /^\d+$/.test(rest)) {
      await put($, { ...s, threshold: Math.max(1, Number(rest)) })
      return `The loop note now comes after ${Math.max(1, Number(rest))} repeat${Number(rest) > 1 ? 's' : ''}.`
    }
    if (rest !== 'on' && rest !== 'off') return `Usage: /coach ${key} on | off${key === 'loop' ? ' | <n>' : ''}`
    await put($, { ...s, [key]: rest === 'on' })
    return `${{ loop: 'Loop detector', done: 'Done-check', style: 'Style guard' }[key]} ${rest}.`
  }
  if (w === 'quiet' || w === 'loud') {
    await put($, { ...s, isLoud: w === 'loud' })
    return w === 'loud' ? 'You see course-correct\'s notes too (as toasts).' : 'Only Claude sees course-correct\'s notes.'
  }
  if (w === 'rewrite' || w === 'headsup') {
    await put($, { ...s, fix: w, toldRewrite: true })
    return w === 'rewrite' ? 'A reply that slips is redone at once.' : 'A reply that slips gets a heads-up for next time.'
  }
  if (w === 'bans') return `Banned phrases:\n${phrases(s).map(p => `- ${p}`).join('\n') || '(none)'}`
  if (w === 'ban' || w === 'unban') {
    if (!quoted) return `Usage: /coach ${w} "<phrase>"`
    const low = quoted.toLowerCase()
    if (w === 'ban') {
      await put($, { ...s, bans: [...s.bans.filter(b => b.toLowerCase() !== low), quoted], unbanned: s.unbanned.filter(u => u !== low) })
      return `Banned "${quoted}".`
    }
    const isBuiltIn = BUILT_IN.some(p => p.toLowerCase() === low)
    await put($, { ...s, bans: s.bans.filter(b => b.toLowerCase() !== low), unbanned: isBuiltIn ? [...new Set([...s.unbanned, low])] : s.unbanned })
    return `Unbanned "${quoted}".`
  }
  if (w === 'comments') {
    if (rest === 'off') {
      await put($, { ...s, comments: undefined })
      return 'No comment limit.'
    }
    if (!/^\d+(\.\d+)?$/.test(rest)) return 'Usage: /coach comments <n> | off (comment lines per 10 lines of code)'
    await put($, { ...s, comments: Number(rest) })
    return `At most ${rest} comment lines per 10 lines of code.`
  }
  if (w === 'language') {
    if (rest === 'off') {
      await put($, { ...s, language: undefined })
      return 'Replies can be in any language.'
    }
    const lang = rest.toLowerCase()
    if (!LANGUAGES.includes(lang)) return `Usage: /coach language <name> | off. Known: ${LANGUAGES.join(', ')}.`
    await put($, { ...s, language: lang })
    return `Replies should be in ${lang}.`
  }
  return `Unknown: /coach ${word}\n\n${HELP}`
}

// Adds a note to a tool's result: Claude reads it right after the result, so no turn is spent on it.
const withNote = <R extends { context?: readonly string[]; deny?: string }>(result: R, note: string): R =>
  result.deny !== undefined ? result : { ...result, context: [...(result.context ?? []), note] }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'coach', description: 'Notes for Claude when it loops, claims done without checking, or slips into banned habits', argumentHint: '[loop|done|style on|off | quiet | loud | ban "<phrase>" | comments <n> | language <name> | rewrite | headsup]' })
    const started = await next(e)
    if (e.isInteractive && !(await $.store.get('asked'))) void setup($).catch(() => {})
    void findTests($, await $.session.root()).then(found => (hasTests = found), () => (hasTests = false))
    return started
  })

  // Asks Claude Code to watch the project folder, so changes made outside Claude count for the done-check.
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const s = await get($)
    if (!s.done) return result
    return { ...result, watchPaths: [...(result.watchPaths ?? []), e.cwd] }
  })

  on('classic.FileChanged', async ($, e, next) => {
    if (!GENERATED.test(e.file_path)) changed.add(e.file_path)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const s = await get($).catch(() => undefined)
    if (!s || e.agentId || (!s.loop && !s.done && !s.style)) return next(e)
    const tool = String(e.tool)
    const input = e as unknown as { tool: string; [k: string]: unknown }
    const result = await next(e)
    if (result.deny !== undefined) return result
    // A slip in the notes never costs Claude the result.
    try {
      const notes: string[] = []

      if (EDIT_TOOLS.has(tool) && !result.isError) {
        edits++
        const file = String(input.file_path ?? input.notebook_path ?? '')
        changed.add(file)
        if (s.loop && (tool === 'Edit' || tool === 'MultiEdit')) {
          const key = `${file}\n${JSON.stringify(tool === 'Edit' ? [input.old_string, input.new_string] : input.edits)}`
          const n = (editsSeen.get(key) ?? 0) + 1
          editsSeen.set(key, n)
          if (n - 1 >= s.threshold) {
            notes.push(REDO_NOTE)
            tell(s, $, 'the same edit was made again, told Claude to step back')
          }
        }
        if (s.style) {
          const code = written(input)
          const slips = banned(code, phrases(s))
          if (slips.length) notes.push(`course-correct: The code you just wrote uses ${slips.map(p => `"${p}"`).join(', ')}, which the user asked you not to use. Take it out.`)
          const rate = s.comments === undefined ? undefined : commentRate(code)
          if (rate !== undefined && s.comments !== undefined && rate > s.comments)
            notes.push(`course-correct: That edit has about ${rate.toFixed(1)} comment lines per 10 lines of code; the user allows at most ${s.comments}. Cut the comments down to what is not obvious from the code.`)
          if (slips.length || (rate !== undefined && s.comments !== undefined && rate > s.comments)) tell(s, $, 'code slipped from your style rules, told Claude')
        }
      }

      if (tool === 'Bash' || tool === 'PowerShell') {
        const command = String(input.command ?? '')
        if (verifies(command)) changed = new Set()
        else if (WRITES.test(command)) changed.add(`(shell) ${command.slice(0, 80)}`)
        const key = s.loop ? errorKey(result.text ?? '') : undefined
        if (key && (result.isError || /error|fail/i.test(result.text ?? ''))) {
          const seen = errorsSeen.get(key)
          if (seen && edits > seen.edits) {
            seen.repeats++
            if (seen.repeats >= s.threshold) {
              notes.push(LOOP_NOTE)
              tell(s, $, 'same error came back after the fix, told Claude to step back')
            }
          }
          errorsSeen.set(key, { edits, repeats: seen?.repeats ?? 0 })
        }
      }
      return notes.reduce(withNote, result)
    } catch {
      return result
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'plugin' && e.origin.name === 'course-correct') isNudgeTurn = true
    else if (e.origin.kind === 'composer') isNudgeTurn = false
    if (pending.length === 0) return next(e)
    const notes = pending
    pending = []
    return next({ ...e, context: [...(e.context ?? []), ...notes] })
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId || e.reason !== 'answer' || !e.answer.trim()) return done
    const s = await get($)
    const wasNudge = isNudgeTurn
    isNudgeTurn = false

    if (s.done && !wasNudge && changed.size > 0 && hasTests) {
      const files = [...changed].slice(0, 20).join(', ')
      const label = await $.model
        .classify(`Files changed: ${files}\n\nReply:\n${e.answer.slice(-4000)}`, ['claims the work is finished or working', 'does not claim that'])
        .catch(() => undefined)
      if (label === 'claims the work is finished or working') {
        changed = new Set()
        tell(s, $, 'Claude said it was done without running anything, asked it to check')
        void $.prompt.submit({ text: DONE_NOTE }).catch(() => {})
        return done
      }
    }

    if (s.style && !wasNudge) {
      const slips = banned(e.answer, phrases(s))
      const lang = s.language ? languageOf(e.answer) : undefined
      const wrongLanguage = s.language && lang && lang !== s.language
      if (slips.length || wrongLanguage) {
        const what = [
          ...(slips.length ? [`used ${slips.map(p => `"${p}"`).join(', ')}, which the user asked you not to use`] : []),
          ...(wrongLanguage ? [`was in ${lang}; the user wants replies in ${s.language}`] : []),
        ].join(', and ')
        if (s.fix === 'rewrite') {
          tell(s, $, 'a reply slipped from your style rules, asked Claude to redo it')
          void $.prompt.submit({ text: `course-correct: Your last reply ${what}. Write it again without that, changing nothing else.` }).catch(() => {})
        } else {
          pending.push(`course-correct: Your last reply ${what}. Avoid that from now on.`)
          tell(s, $, 'a reply slipped from your style rules, Claude gets a heads-up')
          if (!s.toldRewrite) {
            await put($, { ...s, toldRewrite: true })
            $.ui.log('course-correct: Claude gets a heads-up when a reply slips from your style rules. /coach rewrite has it redo the reply at once instead.')
          }
        }
      }
    }
    return done
  })

  on('command.run', { command: 'coach' }, async ($, e) => ({ text: await command($, e.args) }))
}
