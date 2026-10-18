import type { EngineInterface, Register } from 'claude-code'

const PLUGIN = 'writing-assistant'
// true (0.1.x) or 'done' once the person answered or closed the list; a session id while it's out in that session.
const OFFERED = 'setupOffered'
const MAX_PROFILE = 8000
// Profile headings that aren't voices. Nudges is bookkeeping for the draft skill, so it stays out of the prompt.
const REMEMBERED = 'Remembered'
const NUDGES = 'Nudges'

export const QUESTION = 'Which of these should I learn your writing from?'
export const SOURCES = [
  'Gmail (sent emails)',
  'Slack (your messages)',
  'LinkedIn posts (links)',
  'Assignments and reports (files)',
] as const
// The name the setup prompt uses for each, without the bracket.
const shortName = (label: string) => label.replace(/\s*\(.*\)$/, '')

export const SKIPPED = 'Voice setup skipped. /write setup brings it back.'
export const TRIMMED = 'writing-assistant: your profile is over 8k characters, so Claude gets the summaries and reads the file for the rest.'

let profile = ''
let profilePath = ''
// mtime and size of the file last read; '' when there's no file. A change re-reads it before the next request.
let profileStamp: string | undefined
let trimNoted = false

async function findProfilePath($: EngineInterface) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${home.replace(/\\/g, '/')}/.claude/writing-assistant/profile.md` : ''
}

// Cheap enough to run before every request: one stat, and a read only when the file changed.
async function refreshProfile($: EngineInterface) {
  if (!profilePath) profilePath = await findProfilePath($)
  if (!profilePath) return
  const stat = await $.fs.stat(profilePath).catch(() => undefined)
  const stamp = stat?.kind === 'file' ? `${stat.mtimeMs}:${stat.size}` : ''
  if (stamp === profileStamp) return
  profile = stamp ? (await $.fs.read(profilePath)).trim() : ''
  profileStamp = stamp
}

type Section = { name: string; text: string }

// The profile's `## ` sections, in file order.
export const sectionsOf = (text: string): Section[] =>
  text
    .split(/^(?=##\s)/m)
    .filter(part => /^##\s/.test(part))
    .map(part => ({ name: part.slice(2).split('\n')[0]!.trim(), text: part.trim() }))

// Anything above the first `## ` that isn't the `# ` title: notes the person wrote by hand.
const preambleOf = (text: string) => {
  const first = text.split(/^(?=##\s)/m)[0] ?? ''
  return /^##\s/.test(first) ? '' : first.replace(/^#\s.*$/m, '').trim()
}

// Headings are matched loosely so "## remembered" or "## Nudges (counts)" still count as what they are.
const isNamed = (name: string) => (s: Section) => new RegExp(`^${name}\\b`, 'i').test(s.name)
const isRemembered = isNamed(REMEMBERED)
const isNudges = isNamed(NUDGES)
const isVoice = (s: Section) => !isRemembered(s) && !isNudges(s)

// Whole lines of `text` up to `max` characters.
const cutLines = (text: string, max: number) => {
  const lines: string[] = []
  for (const line of text.split('\n')) {
    if ([...lines, line].join('\n').length > max) break
    lines.push(line)
  }
  return lines.join('\n')
}

// The voices the profile has a section for: any heading but Remembered and Nudges, so custom ones count too.
export const voicesIn = (text: string) => sectionsOf(text).filter(isVoice).map(s => s.name)

const summaryOf = (section: Section) => section.text.match(/^Summary:\s*(.+)$/m)?.[1]?.trim()

// What goes in the system prompt: Remembered first (the person's own rules matter most), then the voices, never the
// Nudges table. Over the cap, voices shrink to their summary line; still over, whole sections drop from the end.
export function promptProfile(text: string, max = MAX_PROFILE): { text: string; isTrimmed: boolean } {
  const sections = sectionsOf(text)
  // A profile written some other way (no `## ` headings): send it as it is, cut by lines.
  if (sections.length === 0) {
    const kept = cutLines(text, max)
    return { text: kept, isTrimmed: kept.length < text.length }
  }
  const preamble = preambleOf(text)
  const remembered = [
    ...sections.filter(isRemembered),
    ...(preamble ? [{ name: 'Notes', text: preamble }] : []),
  ]
  const voices = sections.filter(isVoice)
  const join = (parts: Section[]) => parts.map(s => s.text).join('\n\n')
  const full = join([...remembered, ...voices])
  if (full.length <= max) return { text: full, isTrimmed: false }
  const short = voices.map(s => ({ ...s, text: `## ${s.name}\nSummary: ${summaryOf(s) ?? '(see the file)'}` }))
  const kept: Section[] = []
  for (const s of [...remembered, ...short]) {
    if (join([...kept, s]).length > max) break
    kept.push(s)
  }
  // The rules alone are over the cap: keep as many whole lines of them as fit.
  if (kept.length === 0) return { text: cutLines(join(remembered), max), isTrimmed: true }
  return { text: join(kept), isTrimmed: true }
}

// A multi-select answer comes back comma-joined, with anything typed under "Other" in with the labels (none of
// which has a comma).
export function parseAnswer(answer: string) {
  const parts = answer.split(',').map(a => a.trim()).filter(Boolean)
  const picked = SOURCES.filter(s => parts.includes(s))
  const other = parts.filter(p => !(SOURCES as readonly string[]).includes(p)).join(', ')
  return { picked, other }
}

// The tick-box list. Dismissed or nothing given: setup waits for /write setup.
async function askSources($: EngineInterface) {
  const answer = await $.ui
    .ask(QUESTION, { header: 'Voice', multiSelect: true, options: [...SOURCES] })
    .catch(() => '')
  await $.store.set(OFFERED, 'done')
  const { picked, other } = parseAnswer(answer)
  const names: string[] = picked.map(shortName)
  if (other) names.push(`a source I typed in ("${other.slice(0, 200)}")`)
  if (names.length === 0) {
    $.ui.log(SKIPPED)
    return
  }
  const text = [
    `Set up my voice profile from: ${names.join(', ')}.`,
    `Use the ${PLUGIN}:setup skill. Profile file: ${profilePath || '~/.claude/writing-assistant/profile.md'}`,
  ].join(' ')
  // From a timer: a submit from inside a command.run hook would wait on the turn that hook holds.
  $.clock.after(0, () => {
    void $.prompt.submit({ text }).catch(() => $.ui.toast("Voice setup couldn't start: run /write setup to try again"))
  })
}

// First session after install: ask once. The flag only becomes 'done' once the list was answered or closed, so a
// session that ends before it shows asks again next time; the session id stops a hot reload asking twice.
async function offerSetup($: EngineInterface) {
  const offered = await $.store.get(OFFERED)
  if (offered === true || offered === 'done') return
  const id = await $.session.id().catch(() => 'unknown')
  if (offered === id) return
  await $.store.set(OFFERED, id)
  $.clock.after(1500, () => void askSources($).catch(() => {}))
}

const guide = () => {
  if (!profile) {
    return `# Voice\nThe user has no voice profile yet. If they ask for help drafting messages, mention once that \`/write setup\` learns how they write.`
  }
  const { text, isTrimmed } = promptProfile(profile)
  const lines = [
    '# Voice',
    `When the user asks to draft, reply to, write, rewrite or change the tone of a message, email, post or piece of academic writing, follow the \`${PLUGIN}:draft\` skill. Their voice profile (\`${profilePath}\`) is below; it overrides the skill's defaults.`,
  ]
  if (isTrimmed) lines.push(`Only part of the profile fits here: read the file before drafting for the full section of the voice you're using.`)
  return [...lines, '', text].join('\n')
}

// What /write shows: each voice's summary, then the remembered rules, numbered so "forget rule 2" has a target.
function describe() {
  const sections = sectionsOf(profile)
  if (sections.length === 0) return `Profile: ${profilePath}\nIt has no "## " sections, so Claude gets it as written. /write setup adds sources.`
  const voices = sections.filter(isVoice)
  const rules = (sections.find(isRemembered)?.text ?? '')
    .split('\n')
    .filter(line => /^[-*]\s+\S/.test(line))
    .map((line, i) => `  ${i + 1}. ${line.replace(/^[-*]\s+/, '')}`)
  return [
    `Profile: ${profilePath}`,
    voices.length ? 'Voices:' : 'Voices: none yet',
    ...voices.map(s => `  ${s.name}: ${summaryOf(s) ?? '(no summary line)'}`),
    rules.length ? 'Remembered:' : 'Remembered: nothing yet',
    ...rules,
    '/write setup adds sources. Ask Claude to forget a rule by number, or edit the file.',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'write',
      description: 'Learn how you write: /write setup picks the sources; on its own shows your profile',
      argumentHint: '[setup]',
    })
    const started = await next(e)
    await refreshProfile($).catch(() => {})
    // Nobody to ask under -p.
    if (e.isInteractive && !profile) await offerSetup($).catch(() => {})
    return started
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    await refreshProfile($).catch(() => {})
    if (profile && !trimNoted && promptProfile(profile).isTrimmed) {
      trimNoted = true
      $.ui.log(TRIMMED)
    }
    return { ...composed, sections: [...composed.sections, { id: `${PLUGIN}:guide`, text: guide(), scope: 'session' as const }] }
  })

  on('command.run', { command: 'write' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'setup') {
      if (!profilePath) profilePath = await findProfilePath($).catch(() => '')
      $.clock.after(0, () => void askSources($).catch(() => {}))
      return { text: 'Pick the sources to learn from.' }
    }
    if (arg !== '') return { text: 'Usage: /write [setup]' }
    await refreshProfile($).catch(() => {})
    if (!profile) return { text: 'No voice profile yet. /write setup learns how you write.' }
    return { text: describe() }
  })
}
