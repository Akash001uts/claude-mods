# session-archive (lite)

## What it does

This is the code-free version of my session-archive mod. Claude Code deletes your session transcripts after 30 days,
keeps them in a folder most people never open, and names them after whatever you typed first. I lost a few sessions I
wanted back that way. This version gives you a `/sessions` command: Claude copies your sessions into a folder you
pick, gives each one a short title, summary and keywords in an index, finds them again ("the session where I sped up
the order book"), and prints your stats as text.

The big difference from the code version: **nothing copies automatically any more.** Sessions are only archived when
you run `/sessions archive` (or ask). So run it now and then, and before a session gets to 30 days old. The one real
protection that works with no code is raising `cleanupPeriodDays` in Claude Code's settings, and `/sessions setup`
offers to do that for you.

## Install

```
/plugin install session-archive-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`session-archive`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

Then run `/sessions setup` once.

## How to use it

The command is `/sessions` (if another plugin also has a `sessions` command, use `/session-archive-lite:sessions`).

- `/sessions setup` asks where to keep copies (a new `~/claude-sessions` folder, your own folder typed under Other,
  or leave them where Claude Code keeps them and just index them), the format (raw transcript, Markdown or both) and
  how search works by default (by meaning or plain text). It saves that to `~/.claude/session-archive/config.json`,
  offers to raise `cleanupPeriodDays` (it shows the exact change, backs up `settings.json` first and only writes if
  you say yes), and offers to back up what's on disk now. A folder inside OneDrive or Dropbox is a free backup and
  lets several PCs share one archive.
- `/sessions archive` copies this project's sessions that are new or changed since the last copy, including the one
  you're in (a snapshot up to now; run it again later and it overwrites that copy). `/sessions archive all` does
  every project.
- `/sessions backfill` shows how many sessions on disk aren't archived yet and their total size, and copies them if
  you say yes. For a big batch Claude hands groups of about 10 to subagents so your main chat doesn't fill up, and
  Markdown copies are always written by a subagent for the same reason.
- `/sessions search <words>` finds a past session. By meaning, Claude reads the index (titles, summaries, keywords)
  and picks the best matches. `--plain` greps the exact words in the copies and in `~/.claude/projects`. `--here`
  keeps to this project. Each result shows `claude --resume <id>` and the folder to run it from, or, if Claude Code
  already deleted the original, where the archived copy is (and Claude can copy it back for you).
- `/sessions stats` prints sessions, messages, active days, streaks, peak hour and top projects. `stats 7` or
  `stats 30` for the last week or month, `--here` for this project.
- `/sessions folder <path>`, `/sessions format raw|md|both`, `/sessions mode meaning|plain` change the settings.
- `/sessions off` and `/sessions on` skip or include this project when archiving.
- `/sessions` on its own shows the settings, when this project was last archived, and the command list.

You can also just ask: "archive my sessions", "find the session where I fixed the order book", "how many sessions
did I do this month".

## What's different from the code version

| Feature | Lite version |
| --- | --- |
| Copy after turns (every 3 min) and at session end | **Gone.** Nothing runs on its own. You run `/sessions archive`. |
| Copy of the current session | Kept, when you ask. It's a snapshot up to that point. |
| Raw `.jsonl` copy | Kept. Always a plain file copy with Claude's Bash or PowerShell tool (`Copy-Item` or `cp`), which you approve at the normal permission prompt. |
| Markdown copy | Changed. Claude writes a condensed one (your messages and Claude's replies in full, tool calls one line each, no tool output) and only for transcripts up to about 400 KB, because Claude has to read the transcript to write it, which costs tokens. Bigger ones get the raw copy only. |
| Big transcripts (over 4 MiB) copied by the system's copy command | Kept, and now every raw copy works that way. |
| Haiku titles, summaries, keywords in an index | Changed. Claude (the model you're talking to) writes them, starting from Claude Code's own title in the transcript. Same index file and fields, so an old index keeps working. |
| Retitle at the end of a long session | Changed. Retitled on the next archive if the session has doubled in size. |
| Title pushed into Claude Code's session list (`/resume`, sidebar) | Changed. Claude tells you the title and you type `/rename <title>` yourself; a plugin without code can't set it. |
| Missing archive folder: one line, then queue and copy later | Changed. You get the line, but nothing is queued. Run `/sessions archive` again once the folder is back. |
| Catch-up of sessions that changed since their last copy | Changed. `/sessions archive` compares file sizes with the index and re-copies changed ones. |
| Search by meaning | Kept, but done by Claude reading the index, not a separate Haiku call. |
| Plain-text search, `--here`, `claude --resume <id>`, copy-back hint | Kept. |
| Stats pane (heatmap, tokens per model, cost, filters) | Changed. Text summary only. Messages are a rough count (prompts sent with images are missed). Tokens and cost only show for sessions the code version indexed, since this version doesn't add up token use. Claude Code's own `/usage` (also `/stats`) has a Stats tab for what's still on disk. |
| `/sessions folder`, `format`, `mode`, `off`, `on`, `backfill`, `setup` | Kept. Backfill now asks before copying and runs in the chat, not in the background. |
| First-run questions on its own at session start | Gone. Run `/sessions setup`. |
| 30-day reminder | Kept in `/sessions` and setup, plus setup now offers to raise `cleanupPeriodDays` (with your OK and a backup). The code version never touched settings. |
| Settings in plugin storage | Moved to `~/.claude/session-archive/config.json`. Old settings can't carry over, so run setup again (an existing index in the folder is picked up). |

**Why no hooks.** I checked the hook types that need no code. `SessionEnd` can't make Claude do anything, agent hooks
can only read files (so they can't copy), and a `Stop` prompt hook telling Claude to archive would be a model call
after every single turn plus a permission prompt each time, and the archiving turn would fire it again. Not worth it,
so this version has none.

## What it runs and stores

- **What Claude reads**, with its normal Read, Grep and Glob tools: `~/.claude/session-archive/config.json`, the
  index files, your transcripts under `~/.claude/projects` (only the bits it needs: the first `cwd`, timestamps, the
  first few prompts, Claude Code's own title; the whole transcript only when writing a Markdown copy), the archive
  copies when searching, and `~/.claude/settings.json` (for `cleanupPeriodDays`).
- **What it writes**: `~/.claude/session-archive/config.json`; in the archive folder, the copies (`.jsonl` and/or
  `.md`), `index-<pc>.json` and a `README.txt` (with sessions left in place, just the index, in
  `~/.claude/session-archive`). `~/.claude/settings.json` only if you say yes in setup, after it copies the file to
  `settings.json.bak-<date>`.
- **Commands it runs**, each through Claude's Bash or PowerShell tool and the normal permission prompt: a directory
  listing for file sizes, `New-Item -ItemType Directory` / `mkdir -p` for the project folder, `Copy-Item` / `cp` for
  the raw copy, `hostname` once at setup if `COMPUTERNAME` isn't set, and maybe a read-only `ConvertFrom-Json` to add up stats. Nothing else.
- **What leaves the machine**: whatever Claude reads goes into this conversation, which goes to Anthropic like the
  rest of the session. That's transcript excerpts, the index, search results, and whole transcripts when it writes
  Markdown copies. The copy commands send nothing anywhere. If your archive folder is in OneDrive or Dropbox, that
  service syncs it.
- It never deletes or moves a transcript or a copy.

[Privacy](PRIVACY.md)

## Licence

MIT
