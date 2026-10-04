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

- It reads the session's context usage from Claude Code (percentage used, tokens used, window size). It doesn't send
  anything outside Claude Code.
- **Prompts it submits.** When a handoff starts, it submits the wrap-up prompt. That prompt contains the current context
  percentage and window size, the handoff file path, and the steps above, nothing else. After compaction it submits
  the kickoff prompt Claude wrote. In `ask` mode it only fills the prompt box and you decide whether to send. At the
  start of a session it can also put a saved kickoff prompt in the prompt box (it doesn't send it).
- **What it changes in prompts.** Each prompt you send gets one extra hidden line with the context reading, like
  `[context-handoff] Context window: 34% used (68.0k of 200.0k); handoff at 50%.` Your own text isn't changed.
- **What it adds to the system prompt.** A short guide telling Claude what that line means, to suggest wrapping up once
  at the natural end of a task, and where the handoff file goes.
- **Commands it runs.** Only `/compact`, once per handoff, after Claude has called `handoff_ready` and the turn has
  finished. It passes Claude's compaction instructions as the argument.
- **Its own tool.** It adds one tool, `handoff_ready`, which Claude calls at the end of a wrap-up. The mod answers that
  call itself: it saves the kickoff prompt and compaction instructions (or, at the end of a session, saves the kickoff
  prompt for next time) and replies to Claude. It doesn't touch any other tool. Your normal permission rules apply to
  it, so you may get a prompt the first time; add `mcp__context-handoff__handoff_ready` to your allow rules if you
  don't want to be asked.
- **Settings it changes.** `/handoff 60` saves the threshold as this plugin's `threshold` setting (the same one in
  `/config`). It doesn't set anything else or touch environment variables.
- Claude (not the mod) edits your project's existing docs and writes the handoff file during a wrap-up, using its
  normal tools, so your usual permission prompts still apply.
- The kickoff prompt is saved in Claude Code's plugin storage, keyed to the project, so it can be offered next session.
  It's deleted once it's used.

## Licence

MIT
