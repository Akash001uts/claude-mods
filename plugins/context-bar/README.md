# context-bar

A bar above (or below) the prompt that shows how full your context window is, split into the same categories `/context` uses
(system prompt, tools, memory files, messages and so on). I used to run `/context` every so often just to check how
heavy a session was getting. Now it's always there, so I can wrap up before auto-compact kicks in, and I can spot
what's eating my context, like MCP servers I forgot were still connected.

```
███████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒▒▒▒▒ 30% 60.0k/200.0k
■ System prompt 4.0k  ■ Messages 56.0k
5h 42% (resets in 2h 14m)  ·  7d 18%  ·  100.0k to compact  ·  session 2h 5m
```

## How it works

- It turns on at the start of every session and updates after each turn.
- The first time it runs (and after an update that adds something worth knowing) it prints a short rundown of the
  commands in the chat. `/context-bar help` shows it again.
- The third line shows your 5-hour and 7-day rate limits (subscription accounts only), how many tokens are left before
  auto-compact, and how long the session has been running. It hides itself if there isn't room for it.
- `/context-bar` hides or shows the bar for the current session.
- `/context-bar below` moves the bar under the prompt box, and `/context-bar above` moves it back. It remembers that
  across sessions. "Bar position" in `/config` sets the starting position, and the command's choice wins over it once
  you've used it. Above is the default, and the desktop app always keeps it above.
- `/context-bar details` opens a pane with the full breakdown: each category and its share of the window, every memory
  file, MCP servers (and how many of their tools are loaded), your biggest skills, custom agents, and the cache split of
  the last API call. Press `r` to refresh it.

## What it runs and stores

- It only reads the session's usage numbers from Claude Code, the same ones `/context` shows. It doesn't read your
  files or messages, and it doesn't send anything anywhere.
- The details pane asks Claude Code for the full token count, which costs a few extra requests (same as running
  `/context`). So it only refreshes while the pane is open, after each turn or when you press `r`.
- Whether the bar is on is kept for the current session only. The only things saved are where you put the bar (above
  or below) and a note that you've seen the rundown, both in the plugin's own storage. It doesn't change your Claude
  Code settings or environment variables.

## What each hook does

The mod is one file, `hooks/register.tsx`. It hooks these events and nothing else:

- `session.start`: registers the `/context-bar` command, prints the command rundown the first time, and starts a
  once-a-minute clock tick so the session length and reset countdowns stay current.
- `command.run` (for `/context-bar` only): toggles the bar, moves it above or below, opens the details pane or shows help.
- `session.measure` and `turn.complete`: re-read the session's usage numbers so the bar is current. While the details
  pane is open, `turn.complete` also refreshes the full breakdown.
- `ui.render` for the area above the prompt, the hint line under it, and its own details pane: draws the bar or the
  pane. Anything else drawn there by Claude Code or other plugins still shows.
- `ui.close`: notes that the details pane was closed, so it stops refreshing.

It never runs commands or processes, reads or writes your files, makes network requests, or answers tool calls.

## Licence

MIT
