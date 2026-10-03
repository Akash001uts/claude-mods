# akash-mods

Mods for [Claude Code](https://claude.com/claude-code): small plugins that add live UI and behaviour to the terminal.

## Install

```
/plugin marketplace add Akash001uts/claude-mods
/plugin install context-bar@akash-mods
/plugin install context-handoff@akash-mods
```

Requires a recent Claude Code build with mod (function-hook plugin) support. Developed on 2.1.288.

## Plugins

### context-bar

A stacked bar above the prompt showing how full the context window is, split by the same categories as `/context`
(system prompt, tools, memory, messages and so on), with free space and the autocompact buffer shaded.

```
███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒ 30% 60.0k/200.0k
■ System prompt 4.0k  ■ Messages 56.0k
5h 42% (resets in 2h 14m)  ·  7d 18%  ·  100.0k to compact  ·  session 2h 5m
```

- On at the start of every session; refreshes after each turn and as the context changes.
- The third line shows your 5-hour and 7-day rate limits (subscription accounts only), how many tokens are left before
  auto-compaction runs, and how long the session has been going. It's dropped when there's no room for a third row.
- `/context-bar` hides or shows it for the current session.
- `/context-bar details` opens a pane with the full breakdown: every category with its share of the window, each memory
  file, MCP servers (tokens and how many tools are loaded), the largest skills, custom agents, the slash-command listing,
  and the cache read/write split of the last API call. It counts tokens the way `/context` does, so it refreshes only
  while the pane is open (after each turn, or press `r`).

### context-handoff

Keeps long sessions from degrading. When the context window crosses a threshold (50% by default), it hands the work
off cleanly instead of waiting for autocompact:

1. Claude gets a handoff prompt and runs the bundled `wrap-up` skill: it updates the docs the project already keeps,
   writes a handoff file (`.claude/handoff.md`), and drafts compaction instructions and a kickoff prompt.
2. The plugin runs `/compact` with those instructions.
3. Once compaction lands, it sends the kickoff prompt, so the work carries on from the handoff file.

It also gives Claude visibility into context usage: every prompt carries a hidden line like
`Context window: 34% used (68.0k of 200.0k)`, and Claude is told to suggest wrapping up once, briefly, when a task
reaches its natural end and the window is filling. Run `/context-handoff:wrap-up` yourself at the end of a session and
the kickoff prompt is put in the prompt box the next time you open a session in that project.

- `/handoff` starts a handoff straight away, whatever the context level.
- `/handoff 60` (or `/handoff at 60%`) sets when the automatic handoff kicks in, from 5% to 95%. It's saved as the
  plugin's `threshold` setting, so it carries over to future sessions.
- `/handoff off` and `/handoff on` pause or resume the automatic one for the session; `/handoff status` shows the
  reading and settings; `/handoff resume` puts a saved kickoff prompt back in the box.
- Settings (`/config`): `threshold` (default 50), `mode` (`auto` runs it, `ask` puts the handoff prompt in the box for
  you to send, `off` only shows Claude the reading), `handoffPath`.
- Only the main conversation hands off, and only after a turn finishes normally. An interrupted turn cancels the
  handoff, and the engine's own autocompact never sends the kickoff prompt.

## Licence

MIT
