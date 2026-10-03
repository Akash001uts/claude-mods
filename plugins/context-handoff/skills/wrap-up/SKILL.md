---
name: wrap-up
description: Wrap up a session cleanly. Updates the project's docs, writes a handoff file, and drafts a compaction prompt and a kickoff prompt for the next stretch of work. Use when a task reaches its natural end and the context window is getting full, when the user says "wrap up", "hand off", "let's stop here" or "start a fresh session", or when the context-handoff plugin asks for a handoff.
argument-hint: "[continue|end]"
---

# Wrap up

Two modes:

- **end** (the default when the user runs `/wrap-up`): the session is finishing. The kickoff prompt is for a fresh session.
- **continue** (when the context-handoff plugin asks, or the argument is `continue`): the conversation compacts and carries on
  straight away. The kickoff prompt is sent automatically after compaction.

Work through the steps in order and keep each one short. This runs when the context is already full, so don't re-read
files you've already seen unless you need to check something.

## 1. Update the docs the project already keeps

Look for the files this project uses to track itself: a project summary or status file, a TODO or roadmap, the
README's status section, CLAUDE.md notes about current work. Update them so they match where things stand now: what's
done, what's pending, any decisions made this session. Edit what's there. Don't create new doc files, and don't touch
docs that this session's work didn't affect.

## 2. Write the handoff file

Write it to the path the `[context-handoff]` guide names (default `.claude/handoff.md`, relative to the project root),
overwriting the previous handoff. Create the folder if it's missing. Use this shape:

```markdown
# Handoff: <task in a few words> (<date>)

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
```

Facts only: paths, commands, error text, numbers. Leave out the story of how you got here unless it explains a
decision.

## 3. Draft the compaction instructions (continue mode only)

These are passed to `/compact` to tell the summary what to keep. Something like:

> Keep: the goal, the decisions and their reasons, every file path touched, the exact next step, and that the full
> handoff is in `<handoff path>`. Drop: file contents already saved to disk, exploratory dead ends, tool output.

Tailor it to this task.

## 4. Draft the kickoff prompt

This is the first message of the next stretch, so it has to stand on its own. It should:

- name the handoff file and ask for it to be read first, along with the project's own summary doc if there is one
- state the goal in one line and the very next step
- mention anything that must not be redone or undone

Keep it under about 120 words.

## 5. Hand over

Call the `mcp__context-handoff__handoff_ready` tool last, with `mode` (`continue` or `end`), `handoffPath`,
`kickoffPrompt`, and in continue mode `compactInstructions`.

- **continue**: then end your turn with one line saying the handoff is written. Don't make any more tool calls. The
  plugin compacts and sends the kickoff prompt.
- **end**: then show the user the kickoff prompt in a fenced block so they can copy it, and stop. The plugin also puts
  it in the prompt box when the next session opens in this project.

If the tool isn't available (the plugin is off), finish the same way: in continue mode tell the user to run
`/compact <instructions>` and then paste the kickoff prompt, and in end mode just show the kickoff prompt.
