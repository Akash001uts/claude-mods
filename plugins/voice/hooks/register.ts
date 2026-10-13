import type { EngineInterface, Register } from 'claude-code'

const PLUGIN = 'voice'
const OFFERED = 'setupOffered'
const MAX_PROFILE = 8000

export const QUESTION = 'Which of these should I learn your writing from?'
export const SOURCES = [
  'Gmail (sent emails)',
  'Slack (your messages)',
  'LinkedIn posts (links)',
  'Assignments and reports (files)',
] as const
// The name the setup prompt uses for each, without the bracket.
const shortName = (label: string) => label.replace(/\s*\(.*\)$/, '')

export const SKIPPED = 'Voice setup skipped. /voice setup brings it back.'

// Read once a session: edits Claude makes mid-session show from the next one (Claude already knows them).
let profile = ''
let profilePath = ''

async function findProfilePath($: EngineInterface) {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  return home ? `${home.replace(/\\/g, '/')}/.claude/voice/profile.md` : ''
}

async function loadProfile($: EngineInterface) {
  profilePath = await findProfilePath($)
  profile = ''
  if (!profilePath || !(await $.fs.exists(profilePath))) return
  profile = (await $.fs.read(profilePath)).trim()
}

// The voices the profile has a section for (## Academic, ## Email, ...).
export const voicesIn = (text: string) =>
  [...text.matchAll(/^##\s+(Academic|Email|LinkedIn|Chat)\b/gim)].map(m => m[1]!)

// The tick-box list. Dismissed or nothing ticked: setup waits for /voice setup.
async function askSources($: EngineInterface) {
  const answer = await $.ui
    .ask(QUESTION, { header: 'Voice', multiSelect: true, options: [...SOURCES] })
    .catch(() => '')
  const picked = SOURCES.filter(s => answer.split(',').some(a => a.trim() === s))
  if (picked.length === 0) {
    $.ui.log(SKIPPED)
    return
  }
  const text = [
    `Set up my voice profile from: ${picked.map(shortName).join(', ')}.`,
    `Use the ${PLUGIN}:setup skill. Profile file: ${profilePath || '~/.claude/voice/profile.md'}`,
  ].join(' ')
  // From a timer: a submit from inside a command.run hook would wait on the turn that hook holds.
  $.clock.after(0, () => {
    void $.prompt.submit({ text }).catch(() => $.ui.toast("Voice setup couldn't start: run /voice setup to try again"))
  })
}

const guide = () =>
  profile
    ? [
        '# Voice',
        `When the user asks to draft, reply to, write, rewrite or change the tone of a message, email, post or piece of academic writing, follow the \`${PLUGIN}:draft\` skill. Their voice profile (\`${profilePath}\`) is below; it overrides the skill's defaults.`,
        '',
        profile.slice(0, MAX_PROFILE),
      ].join('\n')
    : `# Voice\nThe user has no voice profile yet. If they ask for help drafting messages, mention once that \`/voice setup\` learns how they write.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'voice',
      description: 'Learn how you write: /voice setup picks the sources; on its own shows your profile',
      argumentHint: '[setup]',
    })
    const started = await next(e)
    await loadProfile($).catch(() => {})
    // First session after install: ask once. Nobody to ask under -p.
    if (e.isInteractive && !profile && !(await $.store.get(OFFERED))) {
      await $.store.set(OFFERED, true)
      $.clock.after(1500, () => void askSources($).catch(() => {}))
    }
    return started
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    return { ...composed, sections: [...composed.sections, { id: `${PLUGIN}:guide`, text: guide(), scope: 'session' as const }] }
  })

  on('command.run', { command: 'voice' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'setup') {
      if (!profilePath) profilePath = await findProfilePath($).catch(() => '')
      $.clock.after(0, () => void askSources($).catch(() => {}))
      return { text: 'Pick the sources to learn from.' }
    }
    if (arg !== '') return { text: 'Usage: /voice [setup]' }
    if (!profile) return { text: 'No voice profile yet. /voice setup learns how you write.' }
    const voices = voicesIn(profile)
    return {
      text: `Profile: ${profilePath}\nVoices: ${voices.length ? voices.join(', ') : 'none yet'}\n/voice setup adds sources. Edit the file to change anything.`,
    }
  })
}
