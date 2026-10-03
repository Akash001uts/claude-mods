import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pending, Phase, Saved } from '../types'

const PLUGIN = 'context-handoff'
const TOOL = 'handoff_ready'
export const TOOL_NAME = 'mcp__context-handoff__handoff_ready'
const SKILL = `${PLUGIN}:wrap-up`

const isAuto = atom({ plugin: 'context-handoff', key: 'isAuto' } as const, true)
const phase = atom({ plugin: 'context-handoff', key: 'phase' } as const, 'idle')
const hasFired = atom({ plugin: 'context-handoff', key: 'hasFired' } as const, false)
const pending = atom({ plugin: 'context-handoff', key: 'pending' } as const, null)

const STATUS: Record<Exclude<Phase, 'idle'>, string> = {
  wrapping: 'Handoff: updating docs…',
  ready: 'Handoff: compacting when this turn ends',
  compacting: 'Handoff: compacting…',
}

export const short = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

// The kickoff prompt saved for the next session in this project.
const savedKey = (root: string) => `kickoff:${root.replace(/\\/g, '/').toLowerCase()}`

const cfg = { threshold: 50, mode: 'auto' as 'auto' | 'ask' | 'off', handoffPath: '.claude/handoff.md' }
let isInteractive = false


// Constant for the session, so it sits after the cache boundary without busting it turn to turn.
const guide = () => [
  '# Context handoff',
  'Each user message carries a `[context-handoff]` line saying how full the context window is. Use it to judge how long the session has run; do not comment on it otherwise.',
  `- When the current task reaches its natural end state (what was asked for is done and checked) and the window is past about 30%, suggest once, in one short line, wrapping up: \`/${SKILL}\` writes a handoff for a fresh session, \`/handoff\` compacts and carries on here. Never suggest it mid-task, never twice for the same task, and drop it if the user keeps going.`,
  `- A prompt from the ${PLUGIN} plugin asking for a handoff means the window crossed ${cfg.threshold}%: follow it, call \`${TOOL_NAME}\` last, then end your turn.`,
  `- This project's handoff file is \`${cfg.handoffPath}\` (relative to the project root).`,
].join('\n')

// Always on show, like the context bar: armed at its threshold, off, or which step a handoff is on.
async function showStatus($: EngineInterface) {
  const now = await read($, phase)
  if (now !== 'idle') return $.ui.status(STATUS[now])
  if (!isInteractive) return
  const isArmed = cfg.mode !== 'off' && (await read($, isAuto))
  await $.ui.status(isArmed ? `Handoff at ${cfg.threshold}%${cfg.mode === 'ask' ? ' (ask)' : ''}` : 'Handoff off')
}

async function setPhase($: EngineInterface, next: Phase) {
  await update($, phase, () => next)
  await showStatus($)
}

async function reading($: EngineInterface) {
  const { context } = await $.session.usage()
  return { percent: context.percent, tokens: context.tokens, window: context.window }
}

const handoffPrompt = (percent: number | undefined, window: number) =>
  [
    `The context window is at ${percent ?? '?'}% of ${short(window)}. Time to hand off before it compacts.`,
    `Run the \`${SKILL}\` skill in continue mode. If it isn't available, do this:`,
    '1. Update the docs this project already keeps (status, pending work, decisions) to match where things stand. Don\'t create new ones.',
    `2. Write the handoff file at \`${cfg.handoffPath}\`: goal, where things stand, next steps in order, key files, decisions and why, open questions.`,
    '3. Draft compaction instructions: what the summary must keep (the task, decisions, file paths, next step) and what it can drop.',
    `4. Draft a kickoff prompt that resumes the work from \`${cfg.handoffPath}\` with no other context.`,
    `5. Call \`${TOOL_NAME}\` with mode "continue", then end your turn. The plugin compacts and sends the kickoff prompt itself.`,
  ].join('\n')

async function startHandoff($: EngineInterface, how: 'auto' | 'ask') {
  const { percent, window } = await reading($)
  const text = handoffPrompt(percent, window)
  if (how === 'ask') {
    // Never overwrite a half-typed prompt: say so and leave /handoff to the person.
    if ((await $.prompt.read()).text.trim()) {
      await $.ui.toast(`Context at ${percent ?? '?'}%: run /handoff when you're ready`)
      return
    }
    await $.prompt.fill({ text, mode: 'replace' })
    await $.ui.toast(`Context at ${percent ?? '?'}%: press Enter to hand off`)
    return
  }
  await setPhase($, 'wrapping')
  // From a timer: a submit from inside a command.run hook would wait on the turn that hook holds.
  $.clock.after(0, () => {
    void $.prompt.submit({ text }).catch(() => cancel($, "Handoff couldn't start: run /handoff to try again"))
  })
}

async function cancel($: EngineInterface, why: string) {
  await update($, pending, () => null)
  await update($, hasFired, () => true)
  await setPhase($, 'idle')
  await $.ui.toast(why)
}

async function fillSaved($: EngineInterface) {
  const key = savedKey(await $.session.root())
  const saved = (await $.store.get(key)) as Saved | undefined
  if (!saved?.kickoff) return false
  const { isFilled } = await $.prompt.fill({ text: saved.kickoff, mode: 'replace' })
  if (!isFilled) return false
  await $.store.delete(key)
  await $.ui.toast('Kickoff prompt from your last session is in the prompt box')
  return true
}

// Saved as the plugin's threshold setting, as /config would; the change reloads the module with it.
// Where the setting can't be written, it holds for this session only.
async function setThreshold($: EngineInterface, percent: number) {
  if (percent < 5 || percent > 95) return 'Pick a threshold between 5% and 95%.'
  cfg.threshold = percent
  await update($, isAuto, () => true)
  await update($, hasFired, () => false)
  const saved = await $.config.set({ key: 'context-handoff.threshold', value: percent }).catch((err: unknown) => ({ deny: String(err) }))
  const where = saved.deny === undefined ? 'Saved for future sessions too.' : `For this session only (couldn't save the setting: ${saved.deny}).`
  const off = cfg.mode === 'off' ? ' Mode is off in /config, so set it to auto or ask for this to take effect.' : ''
  const now = (await reading($)).percent
  const soon = now !== undefined && now >= percent ? ` The window is already at ${now}%, so it starts after your next turn.` : ''
  await showStatus($)
  return `Auto handoff at ${percent}%. ${where}${off}${soon}`
}

export const register: Register = (on, options) => {
  cfg.threshold = Number(options.threshold ?? 50)
  cfg.mode = String(options.mode ?? 'auto') as typeof cfg.mode
  cfg.handoffPath = String(options.handoffPath ?? '.claude/handoff.md')

  on('session.start', async ($, e, next) => {
    isInteractive = e.isInteractive
    // On from the first prompt, like the context bar, and says so in the status line.
    await showStatus($)
    await $.command.register({
      name: 'handoff',
      description: 'Hand off now; /handoff 60 sets when the auto handoff kicks in; also on | off | status | resume',
      argumentHint: '[now | <percent> | on | off | status | resume]',
    })
    await $.tool.register({
      name: TOOL,
      description:
        'Call last in a handoff, once the docs and the handoff file are written. mode "continue": the plugin compacts the conversation with compactInstructions, then sends kickoffPrompt to carry on. mode "end": the session is finishing; kickoffPrompt is put in the prompt box when the next session opens in this project.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['continue', 'end'] },
          handoffPath: { type: 'string', description: 'The handoff file written, relative to the project root' },
          compactInstructions: { type: 'string', description: 'What the compaction summary must keep (mode "continue")' },
          kickoffPrompt: { type: 'string', description: 'The prompt that resumes the work from the handoff file' },
        },
        required: ['mode', 'handoffPath', 'kickoffPrompt'],
      },
    })
    const started = await next(e)
    // A kickoff saved by the last session in this project goes in the prompt box; the box may not be up yet.
    if (isInteractive)
      void fillSaved($).then(isDone => {
        if (!isDone) $.clock.after(1500, () => void fillSaved($).catch(() => {}))
      }, () => {})
    return started
  })

  // Claude sees the reading with every prompt; the person doesn't.
  on('prompt.submit', async ($, e, next) => {
    const { percent, tokens, window } = await reading($).catch(() => ({ percent: undefined, tokens: undefined, window: 0 }))
    if (window <= 0) return next(e)
    const auto = cfg.mode !== 'off' && (await read($, isAuto)) ? `; handoff at ${cfg.threshold}%` : ''
    const line =
      percent === undefined
        ? `[context-handoff] Context window: not measured yet since the start or the last compaction (${short(window)} window)${auto}.`
        : `[context-handoff] Context window: ${percent}% used (${short(tokens ?? 0)} of ${short(window)})${auto}.`
    return next({ ...e, context: [...(e.context ?? []), line] })
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { ...composed, sections: [...composed.sections, { id: `${PLUGIN}:guide`, text: guide(), scope: 'session' as const }] }
  })

  // The plugin's own tool runs without a permission prompt and is always in the model's list.
  on('tool.check', { tool: 'mcp__context-handoff__handoff_ready' }, () => ({ decision: 'allow' as const, reason: 'context-handoff saves its own handoff' }))
  on('tool.describe', { tool: 'mcp__context-handoff__handoff_ready' }, async ($, e, next) => ({ ...(await next(e)), isDeferred: false }))

  // A regex: the typed matcher only names tools that were connected when the types were last laid.
  on('tool.call', { tool: /^mcp__context-handoff__handoff_ready$/ }, async ($, e) => {
    if (e.agentId) return { deny: 'Only the main conversation hands off.' }
    const input = e as unknown as Record<string, unknown>
    const kickoff = typeof input.kickoffPrompt === 'string' ? input.kickoffPrompt.trim() : ''
    const path = typeof input.handoffPath === 'string' ? input.handoffPath : cfg.handoffPath
    if (!kickoff) return { deny: 'kickoffPrompt is empty.' }

    if (input.mode === 'end') {
      const saved: Saved = { kickoff, path, savedAt: await $.clock.now() }
      await $.store.set(savedKey(await $.session.root()), saved)
      await setPhase($, 'idle')
      return { result: 'Saved. The kickoff prompt goes in the prompt box when the next session opens in this project. Show the user the kickoff prompt too, then stop.' }
    }

    const instructions = typeof input.compactInstructions === 'string' ? input.compactInstructions.trim() : ''
    const next: Pending = { instructions, kickoff, path }
    await update($, pending, () => next)
    await setPhase($, 'ready')
    return { result: 'Saved. Compaction starts when this turn ends, then the kickoff prompt is sent. End your turn now with a one-line summary and no more tool calls.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    const now = await read($, phase)

    if (e.isAborted || e.reason !== 'answer') {
      if (now === 'wrapping' || now === 'ready') await cancel($, 'Handoff cancelled: run /handoff to start it again')
      return done
    }

    if (now === 'ready') {
      const p = await read($, pending)
      if (!p) {
        await setPhase($, 'idle')
        return done
      }
      await setPhase($, 'compacting')
      // From a timer, outside the hook the turn waits on; the run itself waits for the session to go idle.
      $.clock.after(0, () => {
        void $.command
          .run({ command: 'compact', args: p.instructions })
          .catch(() => cancel($, 'Handoff: compaction failed. Run /compact yourself, then paste the kickoff prompt'))
      })
      return done
    }

    if (now === 'wrapping') {
      await cancel($, "Handoff didn't finish (no handoff tool call): run /handoff to try again")
      return done
    }

    if (now !== 'idle' || !isInteractive || cfg.mode === 'off' || !(await read($, isAuto))) return done
    const { percent } = await reading($)
    if (percent === undefined) return done
    if (percent < cfg.threshold) {
      if (await read($, hasFired)) await update($, hasFired, () => false)
      return done
    }
    if (await read($, hasFired)) return done
    await update($, hasFired, () => true)
    await startHandoff($, cfg.mode === 'ask' ? 'ask' : 'auto')
    return done
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.trigger === 'precompute') return next(e)
    const now = await read($, phase)
    const p = await read($, pending)
    const r = await next(e)
    if (r.skip !== undefined) {
      if (now === 'compacting') await cancel($, `Handoff: compaction skipped (${r.skip})`)
      return r
    }
    // A fresh window: the threshold can fire again.
    await update($, hasFired, () => false)
    // Only a compaction this plugin started sends the kickoff; the engine's own autocompact doesn't.
    if (now === 'compacting' && p) {
      await update($, pending, () => null)
      await setPhase($, 'idle')
      // From a timer: this compaction runs under /compact's command.run, which a submit here would wait on.
      $.clock.after(0, () => {
        void $.prompt.submit({ text: p.kickoff }).catch(() => $.ui.toast('Handoff: compacted, but the kickoff prompt failed. Paste it from the handoff file'))
      })
    }
    return r
  })

  on('session.end', async ($, e, next) => {
    // /clear starts a new window too.
    await update($, hasFired, () => false)
    return next(e)
  })

  on('command.run', { command: 'handoff' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase() || 'now'
    if (arg === 'on' || arg === 'off') {
      await update($, isAuto, () => arg === 'on')
      await showStatus($)
      return { text: arg === 'on' ? `Auto handoff on at ${cfg.threshold}%.` : 'Auto handoff off for this session.' }
    }
    if (arg === 'status') {
      const { percent, window } = await reading($)
      const auto = cfg.mode === 'off' ? 'off (plugin setting)' : (await read($, isAuto)) ? `${cfg.mode} at ${cfg.threshold}%` : 'off for this session'
      return { text: `Context ${percent ?? '?'}% of ${short(window)}. Handoff: ${auto}. Now: ${await read($, phase)}. File: ${cfg.handoffPath}` }
    }
    if (arg === 'resume') return { text: (await fillSaved($)) ? 'Kickoff prompt is in the prompt box.' : 'No saved kickoff prompt for this project.' }
    const at = /^(?:at\s+)?(\d{1,3})\s*%?$/.exec(arg)
    if (at) return { text: await setThreshold($, Number(at[1])) }
    if (arg !== 'now') return { text: 'Usage: /handoff [now | <percent> | on | off | status | resume], e.g. /handoff 60' }
    if ((await read($, phase)) !== 'idle') return { text: 'A handoff is already running.' }
    await update($, hasFired, () => true)
    await startHandoff($, 'auto')
    return { text: 'Handoff started.' }
  })
}
