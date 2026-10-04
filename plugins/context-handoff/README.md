# context-handoff

Once a session gets long, Claude tends to get worse at keeping track of things, and auto-compact doesn't always keep
the parts you actually need. This mod hands the work off properly instead. It's for longer pieces of work that don't
fit in one context window, like a full assignment, a project spread over a few days, or a big refactor. Without it I
was writing "here's where we're up to" notes by hand before every compact.

## How it works

When the context window hits a threshold (50% by default):

1. Claude gets asked to wrap up. It updates the docs your project already has, writes a handoff file
   (`.claude/handoff.md`), and drafts compaction instructions plus a kickoff prompt.
2. The mod runs `/compact` with those instructions, so the summary keeps what matters.
3. Once compaction finishes, it sends the kickoff prompt and Claude picks up from the handoff file.

It also lets Claude see how full the context is. Each prompt gets a hidden line like
`Context window: 34% used (68.0k of 200.0k)`, and Claude's told to suggest wrapping up (once, and only when a task is
actually finished) if the window is filling up. If you run `/context-handoff:wrap-up` yourself at the end of a session,
the kickoff prompt will be waiting in the prompt box next time you open a session in that project.

## Commands and settings

- The status line shows `Handoff at 50%` so you know it's armed, and shows what step it's on while a handoff runs.
- `/handoff` starts a handoff straight away, whatever the context level.
- `/handoff 60` (or `/handoff at 60%`) changes when the automatic handoff starts. Anything from 5% to 95% works, and it
  saves to the plugin's settings so it sticks between sessions.
- `/handoff off` and `/handoff on` pause or resume the automatic handoff for the current session.
- `/handoff status` shows the current reading and settings, and `/handoff resume` puts a saved kickoff prompt back in
  the box.
- In `/config` you can change `mode`: `auto` (the default) does everything itself, `ask` puts the handoff prompt in the
  box for you to send, and `off` just shows Claude the reading. `handoffPath` changes where the handoff file goes.
- It only hands off from the main conversation, and only after a turn finishes normally. If you interrupt a turn it
  cancels, and Claude Code's own auto-compact never triggers the kickoff prompt.

## What it runs and stores

- It reads the session's context usage from Claude Code. It doesn't send anything anywhere.
- It submits prompts for you: the wrap-up prompt, `/compact` with Claude's instructions, and the kickoff prompt. In
  `ask` mode it only fills the prompt box and you decide whether to send.
- Claude (not the mod) edits your project's existing docs and writes the handoff file during a wrap-up, using its
  normal tools, so your usual permission prompts still apply.
- It adds a short guide to Claude's system prompt and a hidden context reading to each prompt.
- It registers one tool, `handoff_ready`, that Claude calls when the wrap-up is done.
- The kickoff prompt is saved in Claude Code's plugin storage, keyed to the project, so it can be offered next session.
  It's deleted once it's used. `/handoff 60` saves the threshold to the plugin's settings.

## Licence

MIT
