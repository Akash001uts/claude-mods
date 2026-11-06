---
name: guards
description: Tool guards settings - shows which guards are on (shell edits refused so /rewind works, attribution kept out of commits and PRs, big-read advice) and, with consent, sets the attribution setting, permission deny rules for shell edits, or a big-reads rule in CLAUDE.md. Use when the user runs /guards, asks "what guards are on", "turn off the shell edit guard", "stop Claude adding Co-Authored-By", "keep attribution out of my commits", or "set up tool guards".
argument-hint: "[setup | attribution | deny | reads on|off | off]"
---

# /guards

The user typed: `$ARGUMENTS`

tool-guards (code-free version) has two parts:

- **A hook that always runs** (from this plugin's `hooks/hooks.json`): before every Bash or PowerShell command, a
  small model call checks it. It refuses a command that writes a file through the shell (sed -i, perl -i, redirects
  and heredocs into a file, tee, PowerShell Set-Content / Add-Content / Out-File / >), except writes to /dev/null,
  $null or temp and scratch folders, with the reason "Use the Edit or Write tool so /rewind can undo it". It also
  refuses a `git commit` or `gh pr create|edit` that has a Co-Authored-By: Claude line, "Generated with Claude Code"
  or a claude.ai session link. It can't be switched per guard: it's on while the plugin is enabled.
- **Settings this skill can write for the user, only with a yes**: the `attribution` setting and permission deny
  rules in `~/.claude/settings.json`, and a big-reads rule in `~/.claude/CLAUDE.md`.

When a hook refusal comes back as a tool error, just redo the change with Edit or Write (or take the attribution
lines out). Don't try to get around it with another shell trick.

## What to do, by argument

### No argument, `status` or `help`: show what's on

Read (don't change) `~/.claude/settings.json` and `~/.claude/CLAUDE.md`, then show a short list:

- Shell edit guard: on (the hook, while the plugin is enabled). Plus any deny rules from `permissions.deny` that match
  the shell-edit patterns below.
- Attribution guard: the hook is on; also say whether `attribution` is `false` (or `{"commit": "", "pr": ""}`) in
  settings, which stops Claude Code asking for the lines at all.
- Big reads: "advice only" if the `<!-- tool-guards:start -->` block is in CLAUDE.md, otherwise off.

Then list the commands:

```
/guards                 what's on
/guards setup           go through all three
/guards attribution     turn off Claude Code's attribution setting
/guards deny            add permission deny rules for common shell edits
/guards reads on|off    add or remove the big-reads rule in CLAUDE.md
/guards off             how to turn a guard off
```

### `setup`

Go through `attribution`, `deny` and `reads on` below in that order, asking about each one separately. The user can
say no to any of them. Finish with the status list.

### `attribution`

1. Run `claude --version`. The `attribution` setting needs 2.1.281 or later. On an older version, offer
   `"attribution": {"commit": "", "pr": "", "sessionUrl": false}` instead if that works on their version, or stop
   and say the hook still catches it.
2. Read `~/.claude/settings.json`. If `attribution` is already `false`, say so and stop.
3. Show the exact change: the top-level key `"attribution": false` added (or the old value replaced), nothing else
   touched. Ask "Write this?".
4. Only on yes: copy the file to `~/.claude/settings.json.tool-guards.bak` first, then make the one change with the
   Edit tool so the rest of the file stays as it was. Check the result is still valid JSON.
5. Say it takes effect in new sessions.

### `deny`

Permission deny rules are real enforcement (no model call), but they're blunt: a deny matches the start of a
command, so it also blocks a harmless `sed -i` on a temp file. Offer these, and let the user pick which:

```json
"Bash(sed -i:*)",
"Bash(sed --in-place:*)",
"Bash(perl -i:*)",
"Bash(perl -pi:*)"
```

Redirects (`>`, `tee`) can't be matched safely by a prefix rule, so leave those to the hook. If the user also wants
PowerShell ones, say these may not match how Claude Code checks PowerShell commands on their version, and offer
`"PowerShell(Set-Content:*)"`, `"PowerShell(Add-Content:*)"`, `"PowerShell(Out-File:*)"` only if they still want
them.

Then, as with attribution: read the file, show the exact `permissions.deny` array after the change (keep every rule
already there, add only the chosen ones, no duplicates), ask, and only on yes back up to
`~/.claude/settings.json.tool-guards.bak` and make the change with Edit. Check it's valid JSON.

### `reads on`

There's no code-free way to know a file's size or the context left before a Read, so this is advice, not a guard.
Offer to add this block to the end of `~/.claude/CLAUDE.md` (show it exactly, write only on yes, create the file if
it's missing):

```
<!-- tool-guards:start -->
- Before reading a file that might be big (logs, data files, generated or minified code, lockfiles), check its size
  first (line count or bytes). If it's large, read a line range or search it with Grep instead of reading it whole,
  and narrow shell commands (head, tail, grep) before printing a lot of output.
<!-- tool-guards:end -->
```

If a `tool-guards` block is already there, say so and don't add a second one.

### `reads off`

Show the block that will be removed, ask, and on yes remove everything from `<!-- tool-guards:start -->` to
`<!-- tool-guards:end -->` (inclusive) with Edit, leaving the rest of CLAUDE.md as it was.

### `off`, or "turn off <guard>"

Explain plainly:

- The shell edit and attribution checks are one hook, so they go together: `/plugin` and disable tool-guards (or
  uninstall it). There's no per-guard switch without code.
- To undo the settings: offer to remove `"attribution": false` or the deny rules this skill added (same steps: show,
  ask, back up, Edit), or restore `~/.claude/settings.json.tool-guards.bak` if they'd rather.
- Big reads: `/guards reads off`.

### Anything else

Show the status and the command list.

## Rules

- Never write to `~/.claude/settings.json` or `~/.claude/CLAUDE.md` without showing the exact change and getting a yes.
- Always back up `settings.json` before changing it. Change only the keys named above.
