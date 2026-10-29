# auto-handoff

Once a session gets long, Claude tends to get worse at keeping track of things, and auto-compact doesn't always keep
the parts you actually need. This mod hands the work off properly instead. It's for longer pieces of work that don't
fit in one context window, like a full assignment, a project spread over a few days, or a big refactor. Without it I
was writing "here's where we're up to" notes by hand before every compact.

```
/plugin marketplace add Akash001uts/claude-mods
/plugin install auto-handoff@akash-mods
```

It used to be called context-handoff. If you installed it under that name, uninstall `context-handoff@akash-mods` and
install `auto-handoff@akash-mods`. A threshold you set with `/handoff <percent>` won't carry over, so set it again.

## How it works

When the context window hits a threshold (50% by default):

1. Claude gets asked to wrap up. It updates the docs your project already has, writes a handoff file
   (`.claude/handoff.md`), and drafts compaction instructions plus a kickoff prompt.
2. The mod runs `/compact` with those instructions, so the summary keeps what matters.
3. Once compaction finishes, it sends the kickoff prompt and Claude picks up from the handoff file.

It also lets Claude see how full the context is. Each prompt gets a hidden line like
`Context window: 34% used (68.0k of 200.0k)`, and Claude's told to suggest wrapping up (once, and only when a task is
actually finished) if the window is filling up. If you run `/auto-handoff:wrap-up` yourself at the end of a session,
the kickoff prompt will be waiting in the prompt box next time you open a session in that project.

## Commands and settings

- The status line shows `Handoff at 50%` so you know it's armed, and shows what step it's on while a handoff runs.
- `/handoff` starts a handoff straight away, whatever the context level.
- `/handoff 60` (or `/handoff at 60%`) changes when the automatic handoff starts. Anything from 5% to 95% works, and it
  saves in the plugin's own storage so it sticks between sessions. The threshold in `/config` is just the starting
  point: once you've used `/handoff <percent>`, that choice wins.
- `/handoff off` and `/handoff on` pause or resume the automatic handoff for the current session.
- `/handoff status` shows the current reading and settings, and `/handoff resume` puts a saved kickoff prompt back in
  the box.
- In `/config` you can change `mode`: `auto` (the default) does everything itself, `ask` puts the handoff prompt in the
  box for you to send, and `off` just shows Claude the reading. `handoffPath` changes where the handoff file goes.
- It only hands off from the main conversation, and only after a turn finishes normally. If you interrupt a turn it
  cancels, and Claude Code's own auto-compact never triggers the kickoff prompt.

## What it runs and stores

- **What it reads.** The session's context usage from Claude Code (percentage used, tokens used, window size), the
  project folder (to key the saved kickoff prompt), and what Claude passes to its own `handoff_ready` tool. In `ask`
  mode it also checks whether the prompt box is empty, so it never overwrites a draft; it doesn't keep or send what's
  there. It doesn't send anything outside Claude Code.
- **What it puts in the prompts it submits.** It submits two prompts, and only during a handoff:
  - The wrap-up prompt, when the threshold is crossed or you run `/handoff`. It's fixed text plus two of your settings:
    the threshold (like "has reached the 50% handoff threshold") and the handoff file path. Nothing it reads from the
    session goes into it, not the usage numbers, not the conversation.
  - The kickoff prompt, after compaction: the `kickoffPrompt` text Claude wrote in its `handoff_ready` call, word for
    word, so Claude carries on from the handoff file.

  In `ask` mode it only fills the prompt box with the wrap-up prompt and you decide whether to send it. At the start of
  a session it can also put a saved kickoff prompt in the prompt box (it doesn't send it).
- **Which commands it runs and when.** Only `/compact`, once per handoff, with Claude's compaction instructions as the
  argument. It runs after Claude has called `handoff_ready` with mode `continue` and that turn has finished normally
  (not interrupted). It never runs any other command.
- **Which tool it answers for and when.** Only its own tool, `handoff_ready` (`mcp__auto-handoff__handoff_ready`),
  which Claude calls at the end of a wrap-up. The mod's `tool.call` hook is that tool's only implementation, so it
  answers every call to it: it saves the kickoff prompt and compaction instructions (or, with mode `end`, saves the
  kickoff prompt for next session) and replies to Claude. It doesn't stand in for any other tool, and its hook only
  matches that one tool name, so every other tool call goes through untouched. Your normal permission rules apply to
  it, so you may get a prompt the first time; add `mcp__auto-handoff__handoff_ready` to your allow rules if you don't
  want to be asked.
- **What its `prompt.submit` hook does.** Each prompt that's sent gets one extra hidden line with the
  context reading, like `[auto-handoff] Context window: 34% used (68.0k of 200.0k); handoff at 50%.` That line is for
  Claude only. The text of the prompt isn't changed and nothing else is added.
- **What its `prompt.compose` hook changes.** It adds one short section at the end of the system prompt: what that
  hidden line means, to suggest wrapping up once at the natural end of a task, and where the handoff file goes. It
  doesn't change or remove anything else in the system prompt.
- **What its `tool.describe` hook changes.** It keeps its own `handoff_ready` tool loaded in Claude's tool list (not
  deferred), so Claude can call it in a handoff. It doesn't touch any other tool's description.
- **Settings it changes.** None. `/handoff <percent>` (like `/handoff 60`) saves that number (5 to 95) in the plugin's
  own storage, not in your Claude Code settings. It doesn't set any configuration or environment variables.
- Claude (not the mod) edits your project's existing docs and writes the handoff file during a wrap-up, using its
  normal tools, so your usual permission prompts still apply.
- The kickoff prompt is saved in Claude Code's plugin storage, keyed to the project, so it can be offered next session.
  It's deleted once it's used.

## Licence

MIT
