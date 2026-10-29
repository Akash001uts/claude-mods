import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { strip, writes } from '../hooks/guards'

const HEREDOC_COMMIT = `git commit -m "$(cat <<'EOF'
Fix the order book

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"`

type World = { ran: string[]; toasts: string[] }

// Stands in for the engine: runs nothing, records each command that got through. `context` sets the window.
function engine(on: On, settings: Record<string, unknown>, output = 'ok', context = { tokens: 150_000, window: 200_000 }): World {
  const w: World = { ran: [], toasts: [] }
  mock.store(on, { asked: true, settings: { edits: true, attribution: true, reads: true, isLoud: true, editsScope: 'always', attributionMode: 'fix', ...settings } })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.toast', ($, e) => {
    w.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context, rateLimits: [] } }))
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('fs.stat', ($, e) => ({ value: { kind: 'file' as const, size: e.path.includes('huge') ? 400_000 : 2_000, mtimeMs: 0, isLink: false } }))
  on('tool.call', { tool: 'Bash' }, ($, e) => {
    w.ran.push(e.command)
    return { result: { stdout: output, stderr: '', interrupted: false }, text: output }
  })
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('attribution.text', ($, e) => ({ text: e.text }))
  on('classic.UserPromptSubmit', () => ({}))
  return w
}

const start = ($: Engine) => $.session.start({ cwd: 'C:/proj', surface: 'terminal', isInteractive: true })
const bash = ($: Engine, command: string) => $.tool.call({ tool: 'Bash', command })

test('shell writes are found; reads, scratch files and the null device are not', async () => {
  expect(writes("sed -i 's/a/b/' src/x.ts")).toEqual(['src/x.ts'])
  expect(writes('echo hi > notes.txt')).toEqual(['notes.txt'])
  expect(writes('cat >> log.md <<EOF\nline > other\nEOF')).toEqual(['log.md'])
  expect(writes('npm test | tee out.txt')).toEqual(['out.txt'])
  expect(writes('Set-Content -Path README.md -Value hi')).toEqual(['README.md'])
  expect(writes("sed -n '1,20p' x.ts")).toEqual([])
  expect(writes('cat x.ts | grep "a > b"')).toEqual([])
  expect(writes('npm test 2>&1 > /dev/null')).toEqual([])
  expect(writes('node gen.js > /tmp/out.json')).toEqual([])
  expect(writes('python - <<EOF\nprint(1 > 0)\nEOF')).toEqual([])
  expect(writes('Get-Content x.ts > $null')).toEqual([])
})

test('attribution comes out of a heredoc commit and a quoted one', async () => {
  expect(strip(HEREDOC_COMMIT)).toBe(`git commit -m "$(cat <<'EOF'\nFix the order book\nEOF\n)"`)
  const quoted = 'git commit -m "Fix it\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n\nCo-Authored-By: Claude <noreply@anthropic.com>"'
  expect(strip(quoted)).toBe('git commit -m "Fix it"')
  // Inline on one line with other flags: not safe to rewrite.
  expect(strip('git commit -m "Fix" -m "Co-Authored-By: Claude <noreply@anthropic.com>"')).toBeUndefined()
})

test('a shell write is refused with the reason, and nothing runs', async ($, on) => {
  const w = engine(on, {})
  await start($)
  const r = await bash($, "sed -i 's/a/b/' src/book.cpp")
  expect(r.deny).toContain('Use the Edit or Write tool')
  expect(w.ran).toEqual([])
  expect(w.toasts[0]).toContain('src/book.cpp')
})

test('in auto-only scope a shell write passes outside auto mode', async ($, on) => {
  const w = engine(on, { editsScope: 'auto' })
  await start($)
  await $.classic.UserPromptSubmit({ prompt: 'x', session_id: 's', transcript_path: 't', cwd: 'C:/proj', permission_mode: 'default' })
  await bash($, 'echo hi > notes.txt')
  expect(w.ran).toEqual(['echo hi > notes.txt'])
  await $.classic.UserPromptSubmit({ prompt: 'x', session_id: 's', transcript_path: 't', cwd: 'C:/proj', permission_mode: 'auto' })
  expect((await bash($, 'echo hi > notes.txt')).deny).toContain('Edit or Write')
})

test('attribution is taken out of a commit and the commit runs', async ($, on) => {
  const w = engine(on, {})
  await start($)
  await bash($, HEREDOC_COMMIT)
  expect(w.ran[0]).not.toContain('Co-Authored-By')
  expect(w.ran[0]).toContain('Fix the order book')
})

test('refuse mode refuses a commit with attribution', async ($, on) => {
  const w = engine(on, { attributionMode: 'refuse' })
  await start($)
  expect((await bash($, HEREDOC_COMMIT)).deny).toContain('Remove the attribution lines')
  expect(w.ran).toEqual([])
})

test('Claude Code is told to add no attribution while the guard is on', async ($, on) => {
  engine(on, {})
  await start($)
  expect((await $.attribution.text({ kind: 'commit', text: 'Co-Authored-By: Claude' })).text).toBe('')
})

test('with the guard off, attribution passes untouched', async ($, on) => {
  const w = engine(on, { attribution: false })
  await start($)
  expect((await $.attribution.text({ kind: 'pr', text: 'Generated with Claude Code' })).text).toBe('Generated with Claude Code')
  await bash($, HEREDOC_COMMIT)
  expect(w.ran[0]).toContain('Co-Authored-By')
})

test('a read of a quarter or more of the context left asks the person', async ($, on) => {
  engine(on, {})
  await start($)
  const big = await $.tool.check({ tool: 'Read', input: { file_path: 'C:/proj/huge.log' }, approver: 'person' })
  expect(big.decision).toBe('ask')
  expect(big.reason).toContain('% of the context you have left')
  const small = await $.tool.check({ tool: 'Read', input: { file_path: 'C:/proj/small.ts' }, approver: 'person' })
  expect(small.decision).toBe('allow')
})

test('with nobody to ask (claude -p), a big read goes ahead', async ($, on) => {
  engine(on, {})
  await start($)
  expect((await $.tool.check({ tool: 'Read', input: { file_path: 'C:/proj/huge.log' } })).decision).toBe('allow')
})

test('a huge command output gets a note for Claude after it runs', async ($, on) => {
  engine(on, {}, 'x'.repeat(80_000))
  await start($)
  const r = await bash($, 'cat huge.log')
  expect(r.text?.length).toBe(80_000)
  expect(r.context?.join()).toContain('of the context you had left')
})

test('/guards toggles a guard', async ($, on) => {
  const w = engine(on, {})
  await start($)
  const run = (args: string) => $.command.run({ command: 'guards', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  expect((await run('edits off')).text).toBe('Shell edits guard off.')
  await bash($, 'echo hi > notes.txt')
  expect(w.ran).toEqual(['echo hi > notes.txt'])
  expect((await run('')).text).toContain('attribution (fixed quietly), big reads on')
})
