---
name: coach
description: course-correct's settings. Use when the user runs /coach, or asks to ban or unban a phrase Claude keeps using ("stop saying X", "never write load-bearing"), list banned phrases, set a comment limit for code, set the language replies should be in, turn the loop detector, done-check or style guard on or off, or add or remove course-correct's rules in CLAUDE.md.
argument-hint: "[setup | loop|done|style on|off | loop <n> | ban \"<phrase>\" | unban \"<phrase>\" | bans | comments <n>|off | language <name>|off | block | remove]"
---

# /coach

course-correct is code-free. Two things do the work:

1. **The plugin's Stop hook** (always on while the plugin is enabled). At the end of every reply a small model call
   reads Claude's final message and sends Claude back if it (a) says changed code is done or working without
   reporting any run, test or build and without saying it is untested, or (b) uses one of the built-in phrases below.
   It can't read any file, so it knows nothing about the user's own settings.
2. **A marked block in `~/.claude/CLAUDE.md`** that this skill writes only with the user's consent. It carries
   everything the hook can't: the "same error twice" rule, the done rule as a habit, the user's own banned phrases,
   the comment limit and the reply language.

Settings live in `~/.claude/course-correct/rules.md`. Changing a setting does nothing on its own until the CLAUDE.md
block is rewritten, so after every change offer to update the block.

The user typed: `$ARGUMENTS`

## Built-in phrases (also in the hook)

You're absolutely right / belt-and-suspenders / belt and suspenders / Great question / I hope this helps /
Let me know if you'd like / rest assured / It's worth noting

## rules.md

Read it with the Read tool. If it doesn't exist, the defaults are below; create the folder and file with Write the
first time a setting changes (or in setup). Keep this exact shape:

```
# course-correct rules
loop: on
loop-repeats: 1
done: on
style: on
comments: off
language: off
unbanned:
bans:
```

- `loop`, `done`, `style`: `on` or `off`. They decide which lines go in the CLAUDE.md block.
- `loop-repeats`: how many times the same error may come back after a fix before Claude stops (1 = first repeat).
- `comments`: a number (comment lines allowed per 10 lines of code in one edit) or `off`.
- `language`: a language name (english, spanish, chinese, ...) or `off`.
- `unbanned`: built-in phrases the user dropped, one per line as `- phrase`.
- `bans`: the user's own phrases, one per line as `- phrase`.

## What to do for each argument

Match the first word of `$ARGUMENTS`, ignoring case. Quotes around a phrase are not part of it.

- **(empty) or `help`**: read rules.md (or say it's not set up yet and offer `/coach setup`). Show in a few lines:
  which parts are on, the banned phrases (built-in minus unbanned, plus the user's), comment limit, language,
  loop repeats, and whether the CLAUDE.md block is present (Read `~/.claude/CLAUDE.md` and look for
  `<!-- course-correct:start -->`) and whether it matches the current settings. Then list the commands from the
  argument hint, one line each.
- **`setup`**: ask with AskUserQuestion, multi-select, "Which parts of course-correct should be on?": Loop detector,
  Done-check, Style guard. Save to rules.md. Then explain in two lines that the end-of-reply check is part of the
  plugin and runs regardless, and that the rest only works through the CLAUDE.md block, and offer the block (see
  below).
- **`loop on|off`, `done on|off`, `style on|off`**: set it in rules.md, confirm in one line, offer to update the
  block. If they turn `done` or `style` off, say the end-of-reply check still runs while the plugin is enabled;
  `/plugin disable course-correct-lite` turns it off (and this skill with it).
- **`loop <n>`**: set `loop-repeats` to n (at least 1), offer to update the block.
- **`ban "<phrase>"`**: add it to `bans` (no duplicates, ignoring case) and remove it from `unbanned` if it's there.
  Confirm, offer to update the block.
- **`unban "<phrase>"`**: remove it from `bans`; if it's a built-in phrase, add it to `unbanned`. If it was built-in,
  say plainly that the end-of-reply check will still flag it, because that list is fixed in the plugin's hook; only
  the CLAUDE.md block drops it. Offer to update the block.
- **`bans`**: list the active phrases, marking which are built-in and which are the user's.
- **`comments <n>|off`**: set it, confirm ("at most n comment lines per 10 lines of code"), offer to update the block.
- **`language <name>|off`**: set it, confirm, offer to update the block.
- **`block`**: offer the block now (see below).
- **`remove`**: show the block that's there and ask to remove it; on yes, delete everything from
  `<!-- course-correct:start -->` to `<!-- course-correct:end -->` inclusive with Edit, nothing else.
- **`quiet`, `loud`, `rewrite`, `headsup`**: say these were part of the code version and are gone: there are no
  toasts, and the end-of-reply check always asks Claude to restate the slipped sentence in one line.
- Anything else: say it's unknown and show the command list.

## The CLAUDE.md block

Build it from rules.md, leaving out lines for parts that are off and settings that are `off`. If every part is off
and there are no settings, there's nothing to write: offer to remove the block instead.

```
<!-- course-correct:start -->
## course-correct (managed by /coach, edit there)
- Same error again: if a command gives the same error after you changed files to fix it (ignore line numbers, paths and quoted names when comparing), or you are about to make the exact same edit to a file again, stop editing. Explain what is actually going wrong, give two different approaches, then pick one.
- Before saying code works or is done, run it (tests, a build, a type check or the program itself) and say what you ran. If you can't run it, say clearly that it is untested.
- Never use these phrases, in replies or in code and comments you write: "<phrase>", "<phrase>", ...
- Comments: at most <n> comment lines per 10 lines of code in any edit. Keep only what isn't obvious from the code.
- Write replies in <language>.
<!-- course-correct:end -->
```

- First line goes in only with `loop: on`. If `loop-repeats` is more than 1, say "comes back <n> times after you
  changed files to fix it" instead.
- Second line only with `done: on`. Third, fourth and fifth only with `style: on` (and the setting not `off`).
- The phrase list is the built-in phrases minus `unbanned`, plus `bans`.

Steps, every time:
1. Read `~/.claude/CLAUDE.md` (it may not exist).
2. Show the user the exact block text you'll write, and say whether it's new or replaces the existing one.
3. Ask for a clear yes. Without it, write nothing.
4. On yes: if a block exists, replace only the text from the start marker to the end marker with Edit. If not,
   append the block at the end of the file with one blank line before it (create the file if it doesn't exist).
   Touch nothing else in the file.
5. Say it applies from the next session (CLAUDE.md is read at session start), and in this one from now on since
   you've just read it.
