---
name: wrap-up
description: Wrap up a session cleanly. Updates the project's docs, writes a handoff file (.claude/handoff.md) with a kickoff prompt, and gives the user the exact /compact line to paste plus the kickoff prompt to send after it. Use when a task reaches its natural end and the session has run long, or when the user says "wrap up", "hand off", "handover", "let's stop here", "context is getting full", "running out of context", "compact this properly" or "start a fresh session".
argument-hint: "[continue|end]"
---

# Wrap up

Arguments: `$ARGUMENTS`

Two modes:

- **continue**: the user wants to compact this conversation and keep going here. Use it when the argument is
  `continue`, when `/handoff` sent you here, or when the user talks about the context getting full, compacting, or
  carrying on after.
- **end**: the session is finishing and the next stretch starts in a fresh session. Use it when the argument is `end`,
  or the user says "let's stop here", "start a fresh session", "done for today". If nothing points either way, use end.

Work through the steps in order and keep each one short. This usually runs when the context is already full, so don't
re-read files you've already seen unless you need to check something.

## 1. Update the docs the project already keeps

Look for the files this project uses to track itself: a project summary or status file, a TODO or roadmap, the
README's status section, CLAUDE.md notes about current work. Update them so they match where things stand now: what's
done, what's pending, any decisions made this session. Edit what's there. Don't create new doc files, and don't touch
docs that this session's work didn't affect.

## 2. Draft the compaction instructions (continue mode only)

These go after `/compact` to tell the summary what to keep. Something like:

> Keep: the goal, the decisions and their reasons, every file path touched, the exact next step, and that the full
> handoff is in .claude/handoff.md. Drop: file contents already saved to disk, exploratory dead ends, tool output.

Tailor it to this task. Write it as ONE line with no line breaks (the user pastes it into the prompt box, where a line
break would send it early) and keep it under about 80 words.

## 3. Draft the kickoff prompt

This is the first message of the next stretch, so it has to stand on its own. It should:

- name `.claude/handoff.md` and ask for it to be read first, along with the project's own summary doc if there is one
- state the goal in one line and the very next step
- mention anything that must not be redone or undone

Keep it under about 120 words, as a single paragraph.

## 4. Write the handoff file

Write it to `.claude/handoff.md` in the project root (the folder the session was started in, or the repo root),
overwriting the previous handoff. Create the `.claude` folder if it's missing. If the user named a different path,
use that instead and mention it in the kickoff prompt. Use this shape exactly, because `/handoff resume` reads the
`Kickoff prompt` section back next session:

```markdown
# Handoff: <task in a few words> (<YYYY-MM-DD>)

Mode: <continue|end>

## Goal
<What the user is trying to get done, in their terms.>

## Where things stand
<The current state: what works, what's half done, what's failing.>

## Next steps
1. <The very next action, concrete enough to start without asking.>
2. ...

## Key files
- `path/to/file`: <why it matters>

## Decisions and why
- <Choice made>: <reason, and what was ruled out>

## Open questions and gotchas
- <Anything the next session would otherwise trip on: a flaky test, a command that needs approval, a user preference.>

## Compaction instructions
<continue mode: the one line from step 2. end mode: "None (ended for a fresh session).">

## Kickoff prompt
<the kickoff prompt from step 3>
```

Facts only: paths, commands, error text, numbers. Leave out the story of how you got here unless it explains a
decision.

## 5. Hand over

You can't run `/compact` or send prompts yourself, so finish by giving the user exactly what to paste. Make no more
tool calls after this.

**continue mode.** End your reply with this, filled in:

1. One line saying the docs and `.claude/handoff.md` are updated.
2. "Paste this to compact:" then a fenced block holding only `/compact <the one-line instructions>`.
3. "Once it finishes, send this:" then a fenced block holding only the kickoff prompt.

**end mode.** End your reply with:

1. One line saying the docs and `.claude/handoff.md` are updated.
2. "Next session, run `/handoff resume`, or paste this:" then a fenced block holding only the kickoff prompt.

Nothing else after the blocks.
