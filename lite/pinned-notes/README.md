# pinned-notes (lite)

This is the code-free version of my pinned-notes mod. It's just two skills, no hooks and no code.

## What it does

Sometimes there's one thing I need Claude to remember, like "use Australian spelling", "don't touch the tests folder"
or the name of the branch I'm on. If I just say it once, it scrolls away, and after a compact it can get lost in the
summary. This lets you pin it instead.

The code version kept pins in its own storage and put them in the system prompt. This version writes them into a
marked block in a CLAUDE.md file. Claude Code already loads CLAUDE.md files at the start of every session and re-reads
them after a compact, so the pins stick around without any code.

By default pins go in `CLAUDE.local.md` in the project folder. I picked that one because it's the personal,
per-project memory file: it's meant for your own notes rather than the team's, it's usually gitignored, and pins made
in one project don't leak into others (the code version kept pins per project too). If you want a pin everywhere, add
`--global` and it goes in `~/.claude/CLAUDE.md` instead.

## Install

```
/plugin install pinned-notes-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`pinned-notes`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

- `/pin Use Australian spelling` pins a note.
- `/pin` on its own pins the last message you typed before it, so you can pin something after you've already said it.
- `/pin <path>` pins a file or folder, like `/pin C:\Uni\Assignment 2\spec.pdf`, `/pin ~/notes` or `/pin ./docs`
  (relative paths start from the project folder, quotes are fine). Claude gets the full path so it can read the file
  when it's relevant. If the path doesn't exist, it's pinned as plain text.
- `/pin rules` pins your CLAUDE.md files (`~/.claude/CLAUDE.md`, and `CLAUDE.md`, `.claude/CLAUDE.md` or
  `CLAUDE.local.md` in the project, whichever exist) as rules pins, which tell Claude they're binding and to re-read
  them after a compact. It's a stronger standing instruction, not a guarantee.
- `/pin list` shows your project pins and your global pins, numbered.
- `/unpin` removes the latest pin, `/unpin 2` removes number 2, `/unpin all` clears them.
- Add `--global` to any of these to work on `~/.claude/CLAUDE.md` instead, like `/pin --global Reply in Australian
  English` or `/unpin --global 1`.

If another plugin already has a `/pin` or `/unpin`, use `/pinned-notes-lite:pin` and `/pinned-notes-lite:unpin`.

Up to 20 pins per file, each up to 1000 characters.

Each change goes through Claude's normal Edit/Write permission prompt, so you see the exact edit before it happens.
A new pin works straight away in the conversation you're in (Claude just wrote it, so it knows). The file itself is
only loaded fresh when you start a new session or after a compact.

The first time it creates `CLAUDE.local.md` in a git repo that doesn't ignore it, it offers to add it to
`.git/info/exclude` (or `.gitignore`), and only does that if you say yes.

The block looks like this, and you can edit it by hand too (keep the two marker lines as they are):

```
<!-- pinned-notes:start -->
## Pinned notes

The user pinned these. Treat them as standing instructions and context for every session until the user unpins them, including after compaction. Don't comment on them unless asked.

1. Use Australian spelling
2. File (read it when it's relevant): C:\Uni\Assignment 2\spec.pdf
<!-- pinned-notes:end -->
```

## What's different from the code version

- `/pin <text>`: kept.
- `/pin` on its own: kept, but Claude picks your previous message out of the conversation instead of the code
  remembering it.
- `/pin <path>`: kept. Claude checks the path exists with its own tools. No clickable `file://` link, since there's no
  band to draw it in.
- `/pin rules`: kept.
- `/pin list`: kept, and it now shows global pins too.
- `/unpin`, `/unpin <n>`, `/unpin all`: kept.
- 20 pins of 1000 characters: kept (20 per file, so project and global get 20 each).
- Pins in the system prompt so they survive a compact: changed. They're in a CLAUDE.md file instead, which Claude
  Code reloads after a compact anyway.
- Carry-over to the next session in the same project, with a "Keep them / Unpin them" question: changed. Pins just
  stay until you unpin them, so there's no question.
- Resume restores the session's pins: changed. Every session in the project gets the same pins, resumed or not.
  There's no separate set per session any more.
- `--global` for pins in every project: new.
- The band above the prompt (📌, 📄, 📁, 📜 rows, clickable links, ▾ to expand, "+N more"): gone. Nothing code-free
  can draw. Use `/pin list`.
- `/pin hide` and `/pin show`: gone with the band. Typing them just tells you that.
- Pins from the code version: they were in Claude Code's plugin storage, which this version can't read, so pin them
  again once.
- Gitignore offer for `CLAUDE.local.md`: new.

## What it runs and stores

- **Files it writes.** Only the block between `<!-- pinned-notes:start -->` and `<!-- pinned-notes:end -->` in
  `CLAUDE.local.md` in the project folder, or in `~/.claude/CLAUDE.md` with `--global`. It creates `CLAUDE.local.md`
  if it isn't there. It doesn't touch anything else in either file. If you say yes to the gitignore offer, it adds one
  line to `.git/info/exclude` or `.gitignore`.
- **Files it reads.** Those two files (for the block). For `/pin <path>` and `/pin rules` it only checks whether the
  file or folder exists; it doesn't open it. Claude might read a pinned file later when it's relevant to what you're
  doing, through its normal Read tool.
- **How.** Everything is Claude using its normal tools (Read, Glob, Edit, Write, and `git check-ignore` through
  Bash), so each write comes with the usual permission prompt. No hooks, no code, nothing runs in the background.
- **What leaves the machine.** Nothing beyond normal Claude use: the pins are in a CLAUDE.md file, so they're part of
  what Claude Code sends to the model every session, the same as the rest of your CLAUDE.md.
- **Cost.** Pins sit in your context all the time, so lots of long pins use up some context in every session.

## Licence

MIT
