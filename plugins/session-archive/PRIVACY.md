# Privacy: session-archive

Last updated 30 October 2026.

session-archive runs on your own computer inside Claude Code. I don't run a server for it, and it doesn't collect
anything or send anything to me.

## What it reads

- Your Claude Code session transcripts (this session's, and, if you say yes to backfill, the others still under
  `~/.claude/projects`). A transcript is everything in the session, so it can include names, email addresses or
  anything else you or Claude wrote or opened.
- The `cleanupPeriodDays` setting, and a few environment variables: your home folder, `CLAUDE_CONFIG_DIR`, this PC's
  name (to name its index file) and `OS`.

## What it stores, and where

- In the archive folder you choose, on your computer (or a synced folder like OneDrive or Dropbox if you pick one):
  a copy of each session (raw and/or Markdown), an index with each session's title, summary, keywords and usage
  numbers, and a `README.txt`.
- In Claude Code's plugin storage on your computer: your settings, per-project opt-outs and the queue of sessions
  waiting to be copied.

## Who it's shared with

- Anthropic, through Claude Code: a small Haiku call sees the opening of each session (up to 6,000 characters) to
  write its title, and a search by meaning sends your search words and the index's titles, summaries and keywords.
  That's the same place the conversation already went, under your Claude account's terms and Anthropic's privacy
  policy. Plain-text search sends nothing.
- If your archive folder is inside OneDrive, Dropbox or similar, that service syncs it under its own terms. That's
  your choice at setup; the mod doesn't talk to it.
- Nobody else.

## How long it's kept

Until you delete it. The mod never deletes anything. Delete the archive folder (or a project's folder in it) to remove
the copies, and uninstall the plugin to clear its plugin storage.

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
