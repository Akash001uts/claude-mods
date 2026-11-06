# Privacy: session-archive (lite)

Last updated 7 November 2026.

session-archive (lite) is a set of instructions for Claude Code on your own computer. I don't run a server for it,
and it doesn't collect anything or send anything to me. It has no code: everything is done by Claude with its normal
tools, and you approve each command at Claude Code's permission prompt.

## What it reads

- Your Claude Code session transcripts under `~/.claude/projects`, when you run `/sessions archive`, `backfill` or
  `search`. A transcript is everything in the session, so it can include names, email addresses or anything else
  you or Claude wrote or opened.
- Its own settings (`~/.claude/session-archive/config.json`), the index files and the archive copies.
- `~/.claude/settings.json`, to check `cleanupPeriodDays`, and this PC's name (once, at setup, to name its index
  file).

## What it stores, and where

- In the archive folder you choose, on your computer (or a synced folder like OneDrive or Dropbox if you pick one):
  a copy of each session you archive (raw and/or Markdown), an index with each session's title, summary, keywords,
  dates and message counts, and a `README.txt`.
- In `~/.claude/session-archive/`: your settings, and the index if you chose to leave sessions where they are.
- In `~/.claude/settings.json`: a higher `cleanupPeriodDays`, only if you say yes at setup, after a backup copy of
  the file is made next to it.

## Who it's shared with

- Anthropic, through Claude Code: what Claude reads while archiving or searching (transcript excerpts, whole
  transcripts when it writes a Markdown copy, the index, search results) becomes part of your current conversation,
  under your Claude account's terms and Anthropic's privacy policy. The code version only sent a short opening of
  each session to a small Haiku call; this version puts more into the conversation, so use raw-only if that matters
  to you.
- If your archive folder is inside OneDrive, Dropbox or similar, that service syncs it under its own terms. That's
  your choice at setup.
- Nobody else.

## How long it's kept

Until you delete it. It never deletes anything. Delete the archive folder (or a project's folder in it) to remove
the copies, and `~/.claude/session-archive/` to remove the settings.

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
