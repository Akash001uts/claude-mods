# auto-handoff (lite)

This is the code-free version of auto-handoff. It's only skills (plain Markdown), so there's no hooks module and no
code running in the background.

## What it does

Once a session gets long, Claude tends to get worse at keeping track of things, and auto-compact doesn't always keep
the parts you actually need. This hands the work off properly instead. When you wrap up, Claude:

1. updates the docs your project already has (summary, TODO, status section), without making new ones
2. writes a handoff file at `.claude/handoff.md` (goal, where things stand, next steps, key files, decisions, gotchas,
   and the kickoff prompt for next time)
3. gives you the exact `/compact ...` line to paste, so the summary keeps what matters, and the kickoff prompt to send
   once it's compacted

Next session, `/handoff resume` reads the handoff file and carries on from the kickoff prompt.

The difference from the full version is that nothing is automatic. You decide when to wrap up, and you paste the
`/compact` line and the kickoff prompt yourself.

## Install

```
/plugin marketplace add Akash001uts/claude-mods
/plugin install auto-handoff-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`auto-handoff`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

Keep an eye on how full the context is with `/context` (or your status line, if it shows context usage). When it's
getting up there and you've finished a task:

- **Compact and keep going here:** run `/handoff` (or say "context is getting full, wrap up"). Claude updates the docs
  and the handoff file, then ends with two blocks. Paste the first one (`/compact <instructions>`), wait for it to
  finish, then send the second one (the kickoff prompt).
- **Stop for today:** run `/wrap-up` (or say "wrap up", "hand off", "let's stop here", "start a fresh session"). Same
  thing but no `/compact` line, just the kickoff prompt.
- **Pick back up next session:** run `/handoff resume` (or say "pick up where we left off"). Claude reads
  `.claude/handoff.md`, tells you which handoff it is and how old, and starts on the next step.
- `/wrap-up continue` and `/wrap-up end` force the mode if Claude picks the wrong one.
- `/handoff status` says whether there's a handoff file, what's in it, and whether the nudge is on.
- `/handoff nudge on` offers to add a short block to your `~/.claude/CLAUDE.md` telling Claude to suggest wrapping up
  (once) when a task finishes and the session has run long. It shows you the exact text and only writes it if you say
  yes. `/handoff nudge off` takes it out again.

If another plugin also has a `/handoff` or `/wrap-up`, use `/auto-handoff-lite:handoff` and `/auto-handoff-lite:wrap-up`.

## What's different from the code version

- **Automatic handoff at a context threshold (50% default): gone.** Nothing code-free can read context usage or fire on
  it. A Stop prompt hook can't see the context either, so I didn't add one. You watch `/context` and run `/handoff`
  yourself.
- **Hidden per-prompt context reading for Claude: gone.** Claude can't see how full the window is any more.
- **System-prompt nudge to suggest wrapping up at the natural end of a task: changed.** It's now an optional block in
  your `~/.claude/CLAUDE.md` (`/handoff nudge on`), only added after you say yes. Without the reading, Claude judges
  "long session" by feel (turns, files read), so it's rougher.
- **`handoff_ready` tool: gone.** The wrap-up skill writes everything into the handoff file instead, including the
  compaction instructions and kickoff prompt.
- **Running `/compact` with Claude's instructions, then sending the kickoff prompt: changed.** Claude prints the exact
  `/compact` line and the kickoff prompt, and you paste them.
- **`/handoff` (now): kept,** as a skill. It runs the wrap-up in continue mode.
- **`/handoff <percent>`, `/handoff on`, `/handoff off`: gone,** since there's no automatic handoff to tune or pause.
  The skill just tells you that if you try them.
- **`/handoff status`: changed.** It shows the handoff file's details and the nudge, not a context reading (use
  `/context` for that).
- **`/handoff resume`: changed.** It reads the kickoff prompt from `.claude/handoff.md` and acts on it straight away,
  instead of putting it in the prompt box. It doesn't delete it afterwards; the next wrap-up overwrites the file.
- **Kickoff prompt in the prompt box at the start of the next session: gone.** Nothing code-free runs at session start.
  Run `/handoff resume` instead.
- **Status line entry (`Handoff at 50%` and the step it's on): gone.** Plugins can't draw without code.
- **`/config` settings (`threshold`, `mode`, `handoffPath`): gone.** The handoff file is always `.claude/handoff.md`
  unless you tell Claude a different path when you wrap up (then `/handoff resume` won't find it on its own, so point
  Claude at it).
- **`/wrap-up` skill: kept,** with a wider description so it triggers on "wrap up", "hand off", "let's stop here",
  "context is getting full" and "start a fresh session", and it now ends with the paste-ready blocks.
- **Saved kickoff prompt in plugin storage: moved** into the `## Kickoff prompt` section of `.claude/handoff.md`. A
  kickoff prompt saved by the code version isn't carried over.

## What it runs and stores

- **No code, no hooks.** It's two skills. Nothing runs unless you call a skill or Claude picks one up from what you say.
- **Files Claude writes, with its normal tools (so your usual permission prompts apply):**
  - `.claude/handoff.md` in the project, overwritten on each wrap-up
  - your project's existing docs (summary, TODO, README status), only the ones this session's work affected
  - `~/.claude/CLAUDE.md`, only for `/handoff nudge on|off` and only after you say yes to the exact text shown
- **Files it reads:** `.claude/handoff.md`, the files the kickoff prompt names, `~/.claude/CLAUDE.md` (for `status`
  and `nudge`), and `git status` for `/handoff status` in a git repo.
- **Commands:** it never runs `/compact` or sends prompts. You paste those.
- **What leaves the machine:** nothing beyond your normal Claude Code conversation.

## Licence

MIT
