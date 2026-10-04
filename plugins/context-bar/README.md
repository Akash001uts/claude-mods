# context-bar

A bar above the prompt that shows how full your context window is, split into the same categories `/context` uses
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
- The third line shows your 5-hour and 7-day rate limits (subscription accounts only), how many tokens are left before
  auto-compact, and how long the session has been running. It hides itself if there isn't room for it.
- `/context-bar` hides or shows the bar for the current session.
- `/context-bar details` opens a pane with the full breakdown: each category and its share of the window, every memory
  file, MCP servers (and how many of their tools are loaded), your biggest skills, custom agents, and the cache split of
  the last API call. Press `r` to refresh it.

## What it runs and stores

- It only reads the session's usage numbers from Claude Code, the same ones `/context` shows. It doesn't read your
  files or messages, and it doesn't send anything anywhere.
- The details pane asks Claude Code for the full token count, which costs a few extra requests (same as running
  `/context`). So it only refreshes while the pane is open, after each turn or when you press `r`.
- Whether the bar is on is kept for the current session only. Nothing is written to disk.

## Licence

MIT
