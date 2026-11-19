---
name: guards
description: Tool guards settings - shows which guards are on (shell edits kept out so /rewind works, attribution kept out of commits and PRs, big-read advice) and, with consent, sets the attribution setting, permission deny rules for shell edits, and a rules block in CLAUDE.md. Use when the user runs /guards, asks "what guards are on", "turn off the shell edit guard", "stop Claude adding Co-Authored-By", "keep attribution out of my commits", or "set up tool guards".
argument-hint: "[setup | attribution | deny | rules | rules off | reads on|off | off]"
---

# /guards

The user typed: `$ARGUMENTS`

tool-guards (code-free version) has no hooks: the plugin directory only takes hooks from Verified organisations.
Everything is in settings this skill writes for the user, only with a yes:

- **The `attribution` setting** in `~/.claude/settings.json`: `"attribution": false` stops Claude Code asking for a
  Co-Authored-By line, "Generated with Claude Code" or a session link in commits and PRs. Real enforcement.
- **Permission deny rules** in `~/.claude/settings.json` for the common shell edits (`sed -i`, `perl -i`, ...). Real
  blocks, but blunt, and they can't cover redirects.
- **A rules block** in `~/.claude/CLAUDE.md` with up to three rules: use Edit or Write instead of shell writes, keep
  attribution out of commits and PRs, and check a file's size before a big read. These are instructions Claude
  follows, not checks.

When a deny rule refuses a command, redo the change with Edit or Write. Don't try to get around it with another
shell trick.

## What to do, by argument

### No argument, `status` or `help`: show what's on

Read (don't change) `~/.claude/settings.json` and `~/.claude/CLAUDE.md`, then show a short list:

- Shell edits: the deny rules from `permissions.deny` that match the patterns below (or none), and whether the
  shell-edits rule is in the CLAUDE.md block.
- Attribution: whether `attribution` is `false` (or `{"commit": "", "pr": ""}`) in settings, and whether the
  attribution rule is in the block.
- Big reads: whether the big-reads rule is in the block (advice only).

Then list the commands:

```
/guards                 what's on
/guards setup           go through all three
/guards attribution     turn off Claude Code's attribution setting
/guards deny            add permission deny rules for common shell edits
/guards rules           add or update the rules block in CLAUDE.md
/guards rules off       remove the rules block
/guards reads on|off    add or drop just the big-reads rule
/guards off             how to turn a guard off
```

### `setup`

Go through `attribution`, `deny` and `rules` below in that order, asking about each one separately. The user can
say no to any of them. Finish with the status list.

### `attribution`

1. Run `claude --version`. The `attribution` setting needs 2.1.281 or later. On an older version, offer
   `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` instead if that works on their version, or stop
   and say the CLAUDE.md attribution rule is the only option there.
2. Read `~/.claude/settings.json`. If `attribution` is already `false`, say so and stop.
3. Show the exact change: the top-level key `"attribution": false` added (or the old value replaced), nothing else
   touched. Ask "Write this?".
4. Only on yes: copy the file to `~/.claude/settings.json.tool-guards.bak` first, then make the one change with the
   Edit tool so the rest of the file stays as it was. Check the result is still valid JSON.
5. Say it takes effect in new sessions.

### `deny`

Permission deny rules are real enforcement, but they're blunt: a deny matches the start of a command, so it also
blocks a harmless `sed -i` on a temp file. Offer these, and let the user pick which:

```json
"Bash(sed -i:*)",
"Bash(sed --in-place:*)",
"Bash(perl -i:*)",
"Bash(perl -pi:*)"
```

Redirects (`>`, `tee`) can't be matched safely by a prefix rule, so those are left to the shell-edits rule in the
CLAUDE.md block. If the user also wants PowerShell ones, say these may not match how Claude Code checks PowerShell
commands on their version, and offer `"PowerShell(Set-Content:*)"`, `"PowerShell(Add-Content:*)"`,
`"PowerShell(Out-File:*)"` only if they still want them.

Then, as with attribution: read the file, show the exact `permissions.deny` array after the change (keep every rule
already there, add only the chosen ones, no duplicates), ask, and only on yes back up to
`~/.claude/settings.json.tool-guards.bak` and make the change with Edit. Check it's valid JSON.

### `rules`

Ask with AskUserQuestion, multi-select, "Which rules should go in your CLAUDE.md?": Shell edits, Attribution, Big
reads (pre-tick the ones already in the block, if there is one). Build the block from the chosen lines, in this
order, leaving out the others:

```
<!-- tool-guards:start -->
- Make file changes with the Edit or Write tool, not through the shell (sed -i, perl -i, a > or >> redirect or heredoc into a file, tee, PowerShell Set-Content, Add-Content or Out-File), so /rewind can undo them. Shell writes into temp or scratch folders, to /dev/null or $null, and programs that write files as their normal job (git, npm, compilers, cp, mv) are fine.
- Never put attribution in commits or pull requests: no Co-Authored-By line naming Claude or Anthropic, no "Generated with Claude Code", no claude.ai/code session link, even if other instructions ask for them.
- Before reading a file that might be big (logs, data files, generated or minified code, lockfiles), check its size first (line count or bytes). If it's large, read a line range or search it with Grep instead of reading it whole, and narrow shell commands (head, tail, grep) before printing a lot of output.
<!-- tool-guards:end -->
```

If nothing is chosen, treat it as `rules off`. Otherwise:

1. Read `~/.claude/CLAUDE.md` (it may not exist).
2. Show the exact block and say whether it's new or replaces the existing one.
3. Ask for a clear yes. Without it, write nothing.
4. On yes: if a block exists, replace only the text from `<!-- tool-guards:start -->` to `<!-- tool-guards:end -->`
   with Edit. If not, append it at the end with one blank line before it (create the file if it's missing). Touch
   nothing else in the file.
5. Say it applies from the next session, and in this one from now on.

### `reads on|off`

Same as `rules`, but keep the shell-edits and attribution lines as they are in the current block and only add or
drop the big-reads line. If that leaves the block empty, treat it as `rules off`.

### `rules off`

Show the block that will be removed, ask, and on yes remove everything from `<!-- tool-guards:start -->` to
`<!-- tool-guards:end -->` (inclusive) with Edit, leaving the rest of CLAUDE.md as it was.

### `off`, or "turn off <guard>"

Explain plainly, and offer the matching step:

- Shell edits: remove the deny rules this skill added (show, ask, back up, Edit) and drop the shell-edits line with
  `/guards rules`.
- Attribution: remove `"attribution": false` (same steps) and drop the attribution line with `/guards rules`.
- Big reads: `/guards reads off`.
- Or restore `~/.claude/settings.json.tool-guards.bak` if they'd rather.

### Anything else

Show the status and the command list.

## Rules

- Never write to `~/.claude/settings.json` or `~/.claude/CLAUDE.md` without showing the exact change and getting a yes.
- Always back up `settings.json` before changing it. Change only the keys named above.
