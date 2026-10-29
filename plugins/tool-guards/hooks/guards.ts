// Tool guards' checks on a command's text: shell file writes and attribution lines. No `$` in here, so each can be
// tested on its own.

// Heredoc bodies (`<<EOF ... EOF`), whose text isn't run as shell, so a `>` inside one isn't a redirect.
const HEREDOC = /<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g

// The command with quoted text and heredoc bodies blanked out, so only what the shell runs is scanned.
export function bare(command: string) {
  return command
    .replace(HEREDOC, m => m.slice(0, m.indexOf('\n')))
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
}

// Folders where writing a file is fine: temp and scratch space, and the null device.
const SCRATCH = /(^|[\\/])(tmp|temp|scratch|scratchpad)([\\/]|$)|^\/dev\/|^\$null$|^nul$|\$TMPDIR|\$\{?TMP|%TEMP%|%TMP%|\$env:(TEMP|TMP)/i
export const isScratch = (target: string) => SCRATCH.test(target.replace(/^["']|["']$/g, ''))

// The files a shell command writes outside scratch space: redirects (`>`, `>>`, heredocs into a file), `tee`,
// `sed -i`, `perl -i`, and PowerShell's Set-Content, Add-Content and Out-File. Empty when it writes none.
export function writes(command: string): string[] {
  const text = bare(command)
  const found: string[] = []
  // `>file`, `> file`, `>> file`; not `2>&1`, `>&2`, `->`, `=>`, `>=`.
  for (const m of text.matchAll(/(?<![-=<>&|0-9])(?:[0-9]?)(>>?)(?![&=>])\s*([^\s;&|()<>]+)/g)) {
    const target = m[2]!
    if (target && !isScratch(target)) found.push(target)
  }
  for (const m of text.matchAll(/(?:^|[\s;&|(])tee\s+((?:-\S+\s+)*)([^\s;&|()]+)/g)) if (!isScratch(m[2]!)) found.push(m[2]!)
  for (const m of text.matchAll(/(?:^|[\s;&|(])(sed|perl)\s+(?:-\S*\s+)*-[a-zA-Z]*i[a-zA-Z]*\b[^;&|\n]*/g)) {
    const files = m[0].trim().split(/\s+/).slice(1).filter(w => !w.startsWith('-') && !/^['"]{2}$/.test(w))
    const target = files[files.length - 1] ?? m[1]!
    if (!isScratch(target)) found.push(target)
  }
  for (const m of text.matchAll(/\b(Set-Content|Add-Content|Out-File)\b([^;|\n]*)/gi)) {
    const path = /-(?:Path|FilePath|LiteralPath)\s+(\S+)/i.exec(m[2]!)?.[1] ?? m[2]!.trim().split(/\s+/).find(w => w && !w.startsWith('-'))
    if (!path || !isScratch(path)) found.push(path ?? m[1]!)
  }
  return [...new Set(found)]
}

// Lines Claude adds to commits and PRs: the co-author trailer, the "Generated with Claude Code" footer, and a link
// to the claude.ai session.
const ANYWHERE = /Co-Authored-By:[^\n"']*\b(Claude|Anthropic)\b|Generated (with|by) \[?Claude Code|https?:\/\/(www\.)?claude\.ai\/code\//i
const WHOLE_LINE = /^\s*(Co-Authored-By:.*\b(Claude|Anthropic)\b.*|(🤖\s*)?Generated (with|by) \[?Claude Code.*|.*https?:\/\/(www\.)?claude\.ai\/code\/\S*.*)$/i

export const hasAttribution = (text: string) => ANYWHERE.test(text)

// Commands that write a commit message or a PR body.
export const isCommitOrPr = (command: string) => /\bgit\s+(?:-c\s+\S+\s+)*commit\b|\bgh\s+pr\s+(create|edit)\b/.test(command)

// A message read from a file, which the guard can't rewrite: its path, or undefined.
export function messageFile(command: string) {
  const m = /\bgit\s+(?:-c\s+\S+\s+)*commit\b[^\n]*\s(?:-F|--file)[=\s]+(\S+)|\bgh\s+pr\s+(?:create|edit)\b[^\n]*\s--body-file[=\s]+(\S+)/.exec(command)
  return (m?.[1] ?? m?.[2])?.replace(/^["']|["']$/g, '')
}

// The command with the attribution lines taken out, or undefined when that can't be done safely: attribution on a
// line that holds anything else (another flag, an inline `-m "fix\n\nCo-Authored-By: ..."`), or any left over.
// A closing quote at the end of a removed line stays, moved up to the line before.
export function strip(command: string): string | undefined {
  const out: string[] = []
  for (const row of command.split('\n')) {
    if (!ANYWHERE.test(row)) {
      out.push(row)
      continue
    }
    const tail = /["']\)?\s*$/.exec(row)?.[0] ?? ''
    const body = row.slice(0, row.length - tail.length)
    if (/["'`]|<</.test(body) || !WHOLE_LINE.test(body)) return undefined
    if (tail) {
      while (out.length && !out[out.length - 1]!.trim()) out.pop()
      if (!out.length) return undefined
      out[out.length - 1] += tail.trimEnd()
    }
  }
  // Blank lines left hanging before the end of a heredoc message go too.
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n\n+(\s*EOF\b)/g, '\n$1')
  return hasAttribution(text) ? undefined : text
}
