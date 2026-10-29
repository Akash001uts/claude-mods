import type { EngineInterface, Register } from 'claude-code'

const PLUGIN = 'assessment-marker'
// The hidden folder inside a subject, and the file in it that marks the folder as a set-up subject.
export const DIR = '.assessment-marker'
const SUBJECT_FILE = 'subject.json'
// How far up from the session's folder to look for a subject.
const MAX_DEPTH = 8
const MAX_KNOWN = 20

// $.store keys. FIRST_RUN is 'done' once the save question was answered or closed; a session id while it's out.
const FIRST_RUN = 'firstRun'
const SAVE_TO = 'saveTo'
const KNOWN = 'subjects'

export const SAVE_QUESTION = 'Where should I keep your assessment reviews?'
export const SAVE_OPTIONS = ['In each subject folder (outputs/_audits)', 'Chat only'] as const
export const DEFAULT_SAVE = 'outputs/_audits'
export const CHAT_ONLY = 'chat'
export const SAVE_NOTE = (saveTo: string) =>
  `assessment-marker: reviews ${saveTo === CHAT_ONLY ? 'stay in the chat' : `are saved to ${saveTo}`}. Ask for a review in plain words ("grade it now", "am I ready to submit?"); say "just show it here" or "save this one as X" on any review to override it.`
export const USAGE = 'Usage: /mark [ready | setup]'

type Subject = { name: string; path: string }

let cwd = ''
let subject: Subject | undefined
// The subject.json path last found and its mtime:size, so a compose only re-reads when setup changed it.
let subjectStamp: string | undefined

const slashes = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '')
const parentOf = (path: string) => {
  const cut = path.lastIndexOf('/')
  return cut <= 0 || /^[A-Za-z]:$/.test(path) ? undefined : path.slice(0, cut)
}
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// The nearest folder at or above `from` that holds .assessment-marker/subject.json. One stat per level.
async function findSubject($: EngineInterface, from: string) {
  let dir: string | undefined = slashes(from)
  for (let i = 0; dir && i < MAX_DEPTH; i++, dir = parentOf(dir)) {
    const file = `${dir}/${DIR}/${SUBJECT_FILE}`
    const stat = await $.fs.stat(file).catch(() => undefined)
    if (stat?.kind === 'file') return { dir, file, stamp: `${file}:${stat.mtimeMs}:${stat.size}` }
  }
  return undefined
}

// subject.json is written by the setup skill. Only its name is read here; a file that doesn't parse still counts.
export function subjectName(json: string, dir: string) {
  try {
    const name = (JSON.parse(json) as { name?: unknown }).name
    if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 120)
  } catch {}
  return baseName(dir)
}

async function knownSubjects($: EngineInterface): Promise<Subject[]> {
  const known = await $.store.get(KNOWN).catch(() => undefined)
  return Array.isArray(known) ? known.filter((s): s is Subject => typeof s?.name === 'string' && typeof s?.path === 'string') : []
}

// Most recent first, one entry per folder.
async function remember($: EngineInterface, found: Subject) {
  const known = (await knownSubjects($)).filter(s => s.path !== found.path)
  await $.store.set(KNOWN, [found, ...known].slice(0, MAX_KNOWN))
}

// Cheap enough before every request: a stat per level, a read only when subject.json changed.
async function refreshSubject($: EngineInterface) {
  if (!cwd) return
  const found = await findSubject($, cwd)
  if (!found) {
    subject = undefined
    subjectStamp = undefined
    return
  }
  if (found.stamp === subjectStamp) return
  const json = await $.fs.read(found.file).catch(() => '')
  subject = { name: subjectName(json, found.dir), path: found.dir }
  subjectStamp = found.stamp
  await remember($, subject)
}

// The saved choice, or the default folder when there's none.
const saveChoice = (saved: unknown) => (typeof saved === 'string' && saved.trim() ? saved : DEFAULT_SAVE)

// The first option is the default folder, the second chat only; anything typed under Other is the person's own
// folder or file name.
export function parseSave(answer: string) {
  const text = answer.trim()
  if (!text || text === SAVE_OPTIONS[0]) return DEFAULT_SAVE
  if (text === SAVE_OPTIONS[1]) return CHAT_ONLY
  return text.slice(0, 200)
}

// Dismissed: the default folder stands.
async function askSave($: EngineInterface) {
  const answer = await $.ui.ask(SAVE_QUESTION, { header: 'Reviews', options: [...SAVE_OPTIONS] }).catch(() => '')
  const choice = parseSave(answer)
  await $.store.set(SAVE_TO, choice)
  await $.store.set(FIRST_RUN, 'done')
  $.ui.log(SAVE_NOTE(choice))
}

// First session after install: ask once. 'done' only once it was answered or closed, so a session that ends first
// asks again next time; the session id stops a hot reload asking twice.
async function offerFirstRun($: EngineInterface) {
  const offered = await $.store.get(FIRST_RUN)
  if (offered === 'done') return
  const id = await $.session.id().catch(() => 'unknown')
  if (offered === id) return
  await $.store.set(FIRST_RUN, id)
  $.clock.after(1500, () => void askSave($).catch(() => {}))
}

const skill = (name: string) => `\`${PLUGIN}:${name}\``

export function guide(active: Subject | undefined, known: Subject[], save: string) {
  const where = active
    ? [
        `Active subject: ${active.name}, folder \`${active.path}\` (the mod's own files are in \`${active.path}/${DIR}/\`).`,
        `Use only this subject's folder. Never read another subject's materials, profile or reviews.`,
      ]
    : [
        `The session isn't inside a set-up subject folder.${known.length ? ` Set-up subjects: ${known.map(s => `${s.name} (\`${s.path}\`)`).join('; ')}.` : ' No subjects are set up yet.'}`,
        `If the user asks for a review here, ask which subject (those, or "New subject", which runs ${skill('setup')}).`,
      ]
  return [
    '# Assessment marking',
    `The ${PLUGIN} plugin marks the user's university assessments against the real rubric, always with High Distinction (85+) as the bar.`,
    ...where,
    `Reviews are kept: ${save === CHAT_ONLY ? 'in the chat only' : `saved to \`${save}\` inside the subject folder`}. One request can override this ("just show it here", "save this one as X"). The mod also keeps its own copy of every review in \`${DIR}/reviews/\`, always.`,
    `Start a review only on a clear request to mark, grade, score, re-mark or re-check the work, or to check it's ready to submit. Answer smaller questions about the work normally.`,
    `Which skill: subject not set up, or the user wants to set one up: ${skill('setup')}. Marking, re-marking or comparing drafts: ${skill('mark')} (it works out first mark or re-mark). About to submit, or "are these the right files": ${skill('ready')}. Real marks or feedback came back, or the user wants to challenge a mark: ${skill('marks-back')}. A review to hand to another model, or one that came back from one: ${skill('second-opinion')}.`,
    `Run it straight away: don't ask permission first. The first line says the stage, the files and the rubric used. Ask only when you can't tell the subject, the assessment or the stage.`,
  ].join('\n')
}

// What /mark submits for each stage. The skill names make the routing explicit.
export function markPrompt(arg: string) {
  if (arg === 'ready') return `Check my assessment is ready to submit. Use the ${PLUGIN}:ready skill.`
  if (arg === 'setup') return `Set up a subject for assessment marking. Use the ${PLUGIN}:setup skill.`
  return `Mark my assessment. Use the ${PLUGIN}:mark skill and work out whether this is a first mark or a re-mark.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mark',
      description: 'Mark an assessment against its rubric (HD bar). /mark ready checks it before you submit; /mark setup adds a subject',
      argumentHint: '[ready | setup]',
    })
    const started = await next(e)
    cwd = e.cwd
    await refreshSubject($).catch(() => {})
    // Nobody to ask under -p.
    if (e.isInteractive) await offerFirstRun($).catch(() => {})
    return started
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    await refreshSubject($).catch(() => {})
    const known = await knownSubjects($).catch(() => [])
    const saved = await $.store.get(SAVE_TO).catch(() => undefined)
    const text = guide(subject, known, saveChoice(saved))
    return { ...composed, sections: [...composed.sections, { id: `${PLUGIN}:guide`, text, scope: 'session' as const }] }
  })

  on('command.run', { command: 'mark' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg !== '' && arg !== 'ready' && arg !== 'setup') return { text: USAGE }
    const text = markPrompt(arg)
    // From a timer: a submit from inside a command.run hook would wait on the turn that hook holds.
    $.clock.after(0, () => {
      void $.prompt.submit({ text }).catch(() => $.ui.toast("Couldn't start: ask in plain words instead, e.g. \"grade it now\""))
    })
    return { text: arg === 'ready' ? 'Checking it is ready to submit.' : arg === 'setup' ? 'Setting up a subject.' : 'Marking.' }
  })
}
