import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'

import { SET_UP, scanState, soon, when } from '../hooks/register'

const DIR = 'C:/Users/me/.claude/application-assistant'
// 2026-10-30 10:00 local.
const NOW = new Date(2026, 9, 30, 10, 0).getTime()

const BAND = {
  plugin: 'application-assistant',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
}

type World = { submitted: string[]; logs: string[]; asked: string[]; clock: MockClock }

function engine(on: On, files: Record<string, string>, root = 'C:\\Users\\me\\Applications', answer = SET_UP): World {
  const w: World = { submitted: [], logs: [], asked: [], clock: mock.clock(on, { now: NOW }) }
  mock.store(on, {})
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  on('fs.read', ($, e) => {
    const text = files[e.path.replace(/\\/g, '/')]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('session.root', () => ({ value: root }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.log', ($, e) => {
    w.logs.push(String(e.text))
    return { value: undefined }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const q = e.questions[0]!.question
    w.asked.push(q)
    return { result: { questions: e.questions, answers: { [q]: answer } } }
  })
  on('prompt.submit', ($, e) => {
    if (e.origin.kind === 'plugin') w.submitted.push(e.text)
    return { text: e.text, context: e.context }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="beneath" />
  })
  return w
}

declare const setTimeout: (done: () => void, ms: number) => unknown
const start = async ($: Engine) => {
  await $.session.start({ cwd: 'C:/x', surface: 'terminal', isInteractive: true })
  for (let i = 0; i < 20; i++) await new Promise<void>(done => setTimeout(done, 0))
}
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'apply', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

const CONFIG = JSON.stringify({ applicationsDir: 'C:/Users/me/Applications', scanTime: '08:00', lastScan: '2026-10-30T08:01:00', lastScanOk: true, newRoles: 3, lastDigest: '2026-10-30' })
const REMINDERS = JSON.stringify([
  { what: 'OA: Optiver Graduate SWE', due: '2026-10-31', kind: 'oa' },
  { what: 'Follow up: Atlassian intern', due: '2026-11-02', kind: 'followup' },
  { what: 'Closes: Canva intern', due: '2026-12-20', kind: 'closes' },
])

test('reminders due soon, soonest first, and how far away', async () => {
  const list = soon(JSON.parse(REMINDERS), '2026-10-30')
  expect(list.map(r => r.what)).toEqual(['OA: Optiver Graduate SWE', 'Follow up: Atlassian intern'])
  expect(when('2026-10-31', '2026-10-30')).toBe('tomorrow')
  expect(when('2026-10-28', '2026-10-30')).toBe('2d overdue')
})

test('a scan that missed today or failed is said', async () => {
  expect(scanState({ applicationsDir: 'x', scanTime: '08:00', lastScan: '2026-10-30T08:01:00' }, NOW)).toBe('ok')
  expect(scanState({ applicationsDir: 'x', scanTime: '08:00', lastScan: '2026-10-29T08:01:00' }, NOW)).toBe('missed')
  expect(scanState({ applicationsDir: 'x', scanTime: '11:00', lastScan: '2026-10-29T11:01:00' }, NOW)).toBe('ok')
  expect(scanState({ applicationsDir: 'x', lastScanOk: false }, NOW)).toBe('failed')
})

test('a new user is offered setup once, which runs the setup skill', async ($, on) => {
  const w = engine(on, {})
  await start($)
  expect(w.asked.length).toBe(1)
  expect(w.submitted[0]).toContain('application-assistant:setup')
})

test('in the applications folder: a rundown and the reminders band', async ($, on) => {
  const w = engine(on, { [`${DIR}/config.json`]: CONFIG, [`${DIR}/reminders.json`]: REMINDERS })
  await start($)
  expect(w.logs[0]).toContain('3 new roles')
  expect(w.logs[0]).toContain('OA: Optiver Graduate SWE: tomorrow')
  expect(w.submitted).toEqual([])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /OA: Optiver Graduate SWE/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Canva/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('outside the applications folder, nothing shows', async ($, on) => {
  const w = engine(on, { [`${DIR}/config.json`]: CONFIG, [`${DIR}/reminders.json`]: REMINDERS }, 'C:\\code\\other')
  await start($)
  expect(w.logs).toEqual([])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Optiver/ })).toBeUndefined()
  await ui.unmount()
})

test('a missed scan runs at session start in the applications folder', async ($, on) => {
  const missed = JSON.stringify({ applicationsDir: 'C:/Users/me/Applications', scanTime: '08:00', lastScan: '2026-10-28T08:00:00', lastScanOk: true })
  const w = engine(on, { [`${DIR}/config.json`]: missed })
  await start($)
  expect(w.logs[0]).toContain("Today's scan hasn't run")
  expect(w.submitted[0]).toContain('application-assistant:check')
})

test('/apply <link> checks the role and builds its pack', async ($, on) => {
  const w = engine(on, { [`${DIR}/config.json`]: CONFIG })
  await start($)
  expect((await run($, 'https://jobs.example.com/123')).text).toBe('Checking https://jobs.example.com/123.')
  await w.clock.settle()
  expect(w.submitted.at(-1)).toContain('application-assistant:role')
  expect((await run($, 'ready')).text).toBe('Usage: /apply ready <role>')
})
