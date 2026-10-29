# tool-guards

Three things Claude does with its tools that keep coming up in the GitHub issues: it edits files through the shell
(`sed -i`, `cat > file`) instead of its Edit tool, which means `/rewind` can't undo them; it puts its own
attribution (a Co-Authored-By trailer, "Generated with Claude Code", a link to the session) in your commits and PRs;
and it reads files so big they eat a big chunk of the context you have left. This mod checks Claude's tool calls
before they run and steps in on those three.

## Install

```
/plugin install tool-guards --marketplace Akash001uts/claude-mods
```

## How it works

- **First run** asks which guards to turn on (shell edits, attribution, big reads; tick any or all) and whether you
  want a note (a toast) when one steps in.
- **Shell edits.** A shell command that writes a file is refused, and Claude reads: "Use the Edit or Write tool for
  file changes, so they can be undone with /rewind." Claude then redoes it with Edit. Caught: `sed -i`, `perl -i`,
  redirects into a file (`>`, `>>`, heredocs into a file), `tee`, and PowerShell's `Set-Content`, `Add-Content`,
  `Out-File` and `>`. Not caught: reads (`sed -n`, `cat`, `grep`, `Get-Content`), anything going to `/dev/null` or
  `$null`, and writes into temp or scratch folders. On in every permission mode by default; `/guards edits auto`
  narrows it to auto mode.
- **Attribution.** First, at the source: Claude Code tells Claude to add these lines, and with this guard on it's told
  nothing. Then, as a safety net, if a `git commit` or `gh pr create|edit` still has a Co-Authored-By: Claude line, a
  "Generated with Claude Code" line or a claude.ai session link, those lines are taken out of the command and it runs.
  If they can't be taken out safely (they share a line with other text, or the message comes from a file), the command
  is refused with the reason instead, so a commit is never mangled. `/guards attribution refuse` always refuses
  instead of fixing.
- **Big reads.** Before Claude reads a file, the mod estimates its size in tokens and compares it with the context you
  have left. At 25% or more, you get Claude Code's own permission prompt: "This read will take about 30% of the
  context you have left. Go ahead?" No tells Claude to read a range or search instead. It's 25% of what's left, not of
  the whole window, so it gets more careful as the session fills. In a `claude -p` run (nobody to ask) the read goes
  ahead. A command's output can't be known before it runs, so for commands Claude gets a note after one that took 25%
  or more: narrow it down next time.

## Commands

- `/guards` shows what's on.
- `/guards edits|attribution|reads on|off` turns one on or off.
- `/guards edits auto|always`, `/guards attribution fix|refuse`.
- `/guards quiet|loud` hides or shows the note when a guard steps in. `/guards setup` asks the first-run questions
  again.

## What it runs and stores

- **What it reads.** The commands and file paths Claude is about to use, the size of a file Claude is about to read,
  the session's context numbers, and, for a commit whose message comes from a file (`git commit -F`, `--body-file`),
  that file, to look for attribution lines.
- **What it changes.** Only `git commit` and `gh pr create|edit` commands, only to take attribution lines out (in fix
  mode), and the attribution text Claude Code gives Claude for commits and PRs (it becomes empty).
- **What it refuses.** Shell commands that write files (with the reason), and commits or PRs whose attribution it
  can't take out safely.
- **What it asks.** Before a file read that would take 25% or more of the context left, through Claude Code's own
  permission prompt. Plus the two first-run questions, once.
- **What it stores.** Your settings, in Claude Code's plugin storage.
- It never runs commands, writes files, changes settings or sends anything anywhere.

## What each hook does

The mod is `hooks/register.tsx`, with the command checks in `hooks/guards.ts`. It hooks these events and nothing
else:

- `session.start`: registers `/guards` and asks the first-run questions once.
- `classic.UserPromptSubmit`, `classic.PostToolUse`: read which permission mode the session is in (for "auto mode
  only"). They change nothing.
- `attribution.text`: with the attribution guard on, answers an empty text for commits and PRs, so Claude isn't told
  to add attribution.
- `tool.call` (Bash and PowerShell only): refuses shell file writes, takes attribution lines out of commit and PR
  commands (or refuses them), and after a command runs, adds a note for Claude when its output took 25% or more of
  the context left. If the hook itself fails before the command runs, the command is refused rather than let through
  unchecked.
- `tool.check` (Read only): asks you before a read that would take 25% or more of the context left. It never allows
  anything Claude Code wouldn't.
- `command.run` (`/guards` only): answers the command.
