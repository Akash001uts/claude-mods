---
name: pin
description: Pin a note, a file or folder path, or the user's CLAUDE.md rules so Claude keeps to it in every session in this project until unpinned. /pin <text>, /pin on its own (pins the user's last message), /pin <path>, /pin rules, /pin list, and --global for all projects.
argument-hint: "[<text> | <path> | rules | list] [--global]"
disable-model-invocation: true
---

# /pin

The user typed `/pin $ARGUMENTS`. Pins live in a marked block inside a CLAUDE.md-type file, which Claude Code loads at
the start of every session and again after compaction. Your job is to edit only that block, then say what changed.

## Which file

- Default: `CLAUDE.local.md` in the project root (the folder Claude Code was started in, or the git repo root if that
  is where the project's `CLAUDE.md` sits). It's personal and per project, so pins made here only apply to this project.
- If the arguments contain `--global` (anywhere), use `~/.claude/CLAUDE.md` instead (on Windows that's
  `%USERPROFILE%\.claude\CLAUDE.md`), so the pin applies in every project. Remove `--global` from the arguments before
  doing anything else with them.

Never touch anything in the file outside the block. If the file doesn't exist yet, create it containing just the block.
If the block doesn't exist yet, add it at the end of the file, after one blank line.

## The block

Exactly this shape (the two marker lines must stay exactly as written, so `/unpin` can find them):

```
<!-- pinned-notes:start -->
## Pinned notes

The user pinned these. Treat them as standing instructions and context for every session until the user unpins them, including after compaction. Don't comment on them unless asked.

1. <pin>
2. <pin>
<!-- pinned-notes:end -->
```

Each pin is one numbered line. Three kinds:

- Note: the text itself, on one line (turn newlines into spaces, trim it, and cut it at 1000 characters).
- File or folder: `File (read it when it's relevant): <absolute path>` or `Folder (read it when it's relevant): <absolute path>`.
- Rules file: `Rules file (the user's standing rules: binding, not background. Follow them for the whole session, and re-read this file after any compaction): <absolute path>`.

Numbering is always 1, 2, 3... with no gaps. The limit is 20 pins per block.

## What to do with the arguments

Work out the case from the arguments (after removing `--global`, trimmed):

1. **`list`**: read both the project's `CLAUDE.local.md` block and the `~/.claude/CLAUDE.md` block (don't edit
   anything). Print the project pins, numbered, then the global pins under a "Global" heading. If both are empty, say
   "Nothing pinned. /pin <text> pins a note; /pin on its own pins your last message." Stop.

2. **`hide` or `show`**: say these are gone in this version (there's no band above the prompt to hide; `/pin list`
   shows the pins). Change nothing. Stop.

3. **`rules`**: find which of these exist: `~/.claude/CLAUDE.md`, and in the project `CLAUDE.md`, `.claude/CLAUDE.md`,
   `CLAUDE.local.md`. Check existence only (for example with a directory listing or Glob); don't read their contents
   for this. Add a Rules file pin for each one, using the absolute path, user's file first. If a file is already pinned
   as a plain File pin, change that line into a Rules file pin in place. Skip any already pinned as a rules pin. Stop
   adding at 20 and say the rest weren't pinned. If none exist, say so and change nothing.

4. **Empty** (just `/pin`): pin the user's previous message in this conversation, meaning the last message they typed
   before this `/pin`, not counting slash commands or tool output. Use its text as the pin text and continue at step 6.
   If there is no earlier message, say "Nothing to pin yet. Use /pin <text>, or send a message first and run /pin to
   pin it." and stop.

5. **Looks like a path**: starts with a drive letter and slash (`C:\`, `D:/`), `/`, `~`, `./` or `../`, and has no
   line breaks. Quotes around it are fine (strip them). Expand `~` to the home folder, and resolve `./` and `../` from
   the project root, to get an absolute path. Check it exists (a directory listing or Glob is enough; don't open the
   file). If it's a file, make a File pin; if a folder, a Folder pin. If nothing is there, pin the original text as a
   plain note and mention the path wasn't found.

6. **Anything else**: a note pin with that text.

For steps 4 to 6:
- If the block already has 20 pins, say "You already have 20 pins. /unpin one first." and change nothing.
- If the exact same pin is already in the block, say "That's already pinned." and change nothing.
- Otherwise add it as the next number, then write the file with Edit (or Write if the file is new).

## Gitignore check (project file only)

When you create `CLAUDE.local.md` for the first time in a git repo, check whether git ignores it
(`git check-ignore -q CLAUDE.local.md`). If it isn't ignored, tell the user once that it's a personal file and offer
to add `CLAUDE.local.md` to `.git/info/exclude` (local only, not committed) or to `.gitignore`. Only do it if they say
yes.

## What to say after a change

One or two short lines:
- what was pinned and its number (for example "Pinned #3." or "File pinned (#2): spec.pdf"), and which file
  (project or global);
- that Claude follows it from now on in this conversation, and the file is loaded fresh in new sessions and after
  compaction.

From this point on, treat the new pin as a standing instruction for the rest of this conversation, the same as the
other pins in the block. Don't comment on pins again unless asked.
