# session-archive

Claude Code deletes your session transcripts after 30 days, keeps them in a folder most people never open, and names
them after whatever you typed first. I lost a few sessions I wanted back that way. This mod keeps a copy of every
session in a folder you pick, gives each one a short title, lets you search all of them ("the session where I sped up
the order book") and shows your usage stats in a pane, built from the archive so old days never drop off.

## Install

```
/plugin install session-archive --marketplace Akash001uts/claude-mods
```

## How it works

- **First run** asks four things with Claude Code's own question box: where to keep the copies (a new
  `~/claude-sessions` folder, a folder you type in, or leave them where Claude Code keeps them and just index them),
  the format (raw transcript, readable Markdown, or both), how search works (by meaning, or plain text), and whether
  to copy the sessions still on disk now. A folder inside OneDrive or Dropbox is a free backup and lets several PCs
  share one archive.
- **Copies** are made after Claude's turns, at most every 3 minutes, and again when the session ends. Each copy
  overwrites that session's own file, so you get one copy per session, and the last one covers the whole session.
  Files go in `<archive>/<project>/<date> <title> <id>.jsonl` (and/or `.md`). The file name is set at the first copy
  and kept; if the title changes later, the new one goes in the index and the Markdown heading.
- **The Markdown copy** has your messages and Claude's replies in full and every tool call with its output (long
  output folds under a "Output (N lines)" line). No thinking blocks.
- **Titles.** After the first turn, a small Haiku call writes a 3 to 5 word title, a two-line summary and keywords.
  If a session grows a lot, it's looked at again at the end. The title also goes into Claude Code's own session list
  (`/resume`, the desktop sidebar) with your next prompt, so `/clear` no longer leaves the old name behind.
- **If the folder goes missing** (drive unplugged, OneDrive signed out) you get one line saying so, and sessions are
  queued and copied once it's back.
- **Big transcripts.** A mod can only read or write files up to 4 MiB. A transcript bigger than that is copied with
  your system's own copy command (`copy` on Windows, `cp` elsewhere), and its stats keep counting from each turn.
- If you choose to leave sessions where they are, the mod reminds you that Claude Code still deletes them after 30
  days unless you raise `cleanupPeriodDays` in `~/.claude/settings.json`. It never changes your settings.

## Commands

- `/sessions` shows the settings and commands.
- `/sessions search <words>` searches every archived session. By meaning (the default) sends your words and the
  index's titles, summaries and keywords to a Haiku call, never whole transcripts. `--plain` matches the exact words
  in the copies instead, which is free. `--here` keeps to this project. Each result shows `claude --resume <id>`, or,
  if Claude Code already deleted the original, where the archived copy is.
- `/sessions stats` opens a pane with sessions, messages, tokens, active days, streaks (every day with a message
  counts), peak hour, favourite model, a heatmap, tokens per model, and a rough cost per day, month and project at
  API prices. Filters for all time, 30 days, 7 days, and this project or all. It works in the desktop app too.
- `/sessions folder <path>`, `/sessions format raw|md|both`, `/sessions mode meaning|plain` change the settings.
  Copies already made stay where they are.
- `/sessions off` stops archiving this project (copies already made stay; delete the folder yourself if you want
  them gone), `/sessions on` starts it again.
- `/sessions backfill` archives the sessions still on disk, in the background. `/sessions setup` asks the first-run
  questions again.

The cost is "≈ at API prices": if you're on a subscription you don't pay it, it's just a sense of scale. Prices are a
table in the mod, dated in the pane, and need updating when Anthropic changes them.

## What it runs and stores

- **What it reads.** This session's transcript file, and, when you say yes to backfill, the other transcripts under
  `~/.claude/projects`. The `cleanupPeriodDays` setting. The environment variables `USERPROFILE`/`HOME` (your home
  folder), `CLAUDE_CONFIG_DIR`, `COMPUTERNAME`/`HOSTNAME` (to name this PC's index file) and `OS`.
- **What files it writes.** Only inside the archive folder you chose: the copies (`.jsonl` and/or `.md`),
  `index-<pc>.json` (its list of sessions with titles and stats) and a `README.txt`. With sessions left in place, just
  the index, in `~/.claude/session-archive`. None of these is a build, start-up, settings or instructions file, and
  no tool runs or obeys them. The paths aren't fixed text because the folder is the one you pick at setup.
- **What it sends and where.** It reads the conversation (the session's transcript) and sends parts of it out in one
  way only: `$.model.complete`, a Haiku call made through Claude Code to Anthropic, the same place the conversation
  already went.
  - Titles: the Haiku call sees the opening of the session (your messages and the start of Claude's replies, up to
    6,000 characters) and writes a title, summary and keywords.
  - A search by meaning sends your search words and the index's titles, summaries and keywords, never whole
    transcripts.
  - Plain-text search sends nothing. The copy commands below only copy a file from one folder on your computer to
    another; they send nothing anywhere.
- **Which programs it starts and why.** Only for a transcript over 4 MiB, because a mod can't read or write a file
  that big:
  - Windows: `cmd /c mkdir <archive project folder>` then `cmd /c copy /y <transcript> <archive copy>`. It starts
    `cmd` because `mkdir` and `copy` are built into it (there's no separate copy program). Both arguments are file
    paths, never other commands.
  - macOS and Linux: `mkdir -p <archive project folder>` then `cp <transcript> <archive copy>`, run directly, no shell.
  - No network tools, no scripts, nothing else.
- **What it asks.** The four first-run questions, once.
- **What it stores.** Your settings, per-project opt-outs and the queue of sessions waiting to be copied, in Claude
  Code's plugin storage.
- It never changes settings, never deletes anything and never sends anything outside Claude Code.

[Privacy](PRIVACY.md): what it reads and stores, where, who it's shared with and how to delete it.

## What each hook does

The mod is `hooks/register.tsx`, with the parsing in `hooks/archive.ts`. It hooks these events and nothing else:

- `session.start`: registers `/sessions`, asks the first-run questions once, starts a timer that copies queued
  sessions a few at a time, and queues any session from the last two weeks that changed after its last copy.
- `classic.Stop`: after Claude's turn in the main session (not subagents), copies the session if the last copy was
  3 or more minutes ago. It doesn't change what the event carries.
- `turn.complete`: adds up each main-session turn's token usage, so a transcript too big to read keeps its stats.
  It doesn't change the answer.
- `classic.SessionEnd`: makes the final copy of the session.
- `classic.UserPromptSubmit`: once a session has a title, sets it as the session's title in Claude Code's own list
  (`sessionTitle`), once per title. It doesn't touch your prompt and takes no permission decision: it passes the
  event on with `next(e)` and returns that result unchanged, only adding `sessionTitle` when there's a new title. It
  never blocks a prompt or changes a decision another hook made.
- `command.run` (`/sessions` only): answers the command.
- `ui.render` (the stats pane only): draws the pane.
