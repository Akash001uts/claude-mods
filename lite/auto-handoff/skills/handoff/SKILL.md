---
name: handoff
description: Pick work back up from a saved handoff, or start a compact-and-carry-on handoff. Use when the user runs /handoff (now, resume, status, nudge), or says "pick up where we left off", "resume from the handoff", "carry on from last session" or "read the handoff". For "wrap up", "hand off" or "let's stop here", use the wrap-up skill instead.
argument-hint: "[now | resume | status | nudge on | nudge off]"
---

# Handoff

Arguments: `$ARGUMENTS`

The handoff file is `.claude/handoff.md` in the project root (the folder the session was started in, or the repo
root). The wrap-up skill writes it. Read the first word of the arguments (lower case) and do the matching section.
If there are no arguments, it's `now`, unless the user's message is about picking up old work, in which case it's
`resume`.

## now

Run the wrap-up skill in **continue** mode: update the docs, write the handoff file, and finish with the `/compact`
line and the kickoff prompt for the user to paste. If the skill isn't available, follow the same steps yourself.

## resume

1. Read `.claude/handoff.md`. If it doesn't exist, say "No handoff file in this project." and stop.
2. Tell the user in one line which handoff it is (its title and date), and if the date is more than a week old, say so.
3. Take the text under `## Kickoff prompt` and act on it as if the user had just sent it: read the files it names
   (the handoff file is already read, so don't read it again) and start on the next step. Don't redo anything the
   handoff says is done.

## status

Reply in two or three short lines:

- whether `.claude/handoff.md` exists, and if so its title, date and mode, and whether `git status` shows it as changed
  or untracked (only if this is a git repo; skip it otherwise)
- that you can't see how full the context window is: the user can check with `/context` (or their status line, if it
  shows context usage), and run `/handoff` or `/wrap-up` when it's getting full
- whether the nudge is on: look for `<!-- auto-handoff:start -->` in `~/.claude/CLAUDE.md`

## nudge on

This adds an always-on line to the user's own `~/.claude/CLAUDE.md`, so ask first.

1. Read `~/.claude/CLAUDE.md` (it may not exist). If it already has `<!-- auto-handoff:start -->`, say the nudge is
   already on and stop.
2. Show the user this exact block and say it will be added at the end of `~/.claude/CLAUDE.md`. Ask "Add it?" and
   wait for a yes. Anything other than a clear yes means don't write.

```markdown
<!-- auto-handoff:start -->
## Wrap-up suggestions (auto-handoff)
When a task reaches its natural end (what was asked for is done and checked) and this session has run long (many turns, lots of files read or long tool output), suggest once, in one short line, wrapping up: `/wrap-up` writes a handoff for a fresh session, `/handoff` compacts and carries on here. Never suggest it mid-task, never twice for the same task, and drop it if I keep going.
<!-- auto-handoff:end -->
```

3. On yes, append the block (with a blank line before it) and keep everything else in the file as it was. Say it's on
   from the next session.

## nudge off

Read `~/.claude/CLAUDE.md`. If it has the block, show the user what will be removed, and on yes remove everything from
`<!-- auto-handoff:start -->` to `<!-- auto-handoff:end -->` (inclusive) plus the blank line before it, leaving the
rest untouched. If there's no block, say the nudge is already off.

## Anything else

If the argument is a percent (like `60` or `at 60%`), `on` or `off`: say in one line that this version has no
automatic handoff, so there's no threshold to set or pause; watch `/context` (or the status line, if it shows context usage) and run
`/handoff` or `/wrap-up` yourself. For anything else, reply with:
`Usage: /handoff [now | resume | status | nudge on | nudge off]`
