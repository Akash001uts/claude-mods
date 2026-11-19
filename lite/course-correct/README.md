# course-correct (lite)

This is the code-free version of course-correct. The full one is a hooks module, and the plugin directory only
takes those from Verified organisations. It turned out the directory takes hooks of any kind (even prompt hooks)
only from Verified organisations too, so this one is just a skill and a CLAUDE.md block. I'm using it for a while to
see if it's good enough.

## What it does

Three things Claude does that annoy me: it goes round in circles fixing the same error, it says "done, that works"
without running anything, and it slips back into habits I've asked it to drop ("You're absolutely right",
comment-heavy code).

It's all one marked block in `~/.claude/CLAUDE.md` that `/coach` writes (after showing it to me and asking):

- Stop when the same error comes back after a fix (or the same edit is about to happen again), explain what's
  actually wrong, give two approaches and pick one.
- Run it (tests, a build, the program) before saying code works, or say clearly it's untested.
- Never use the banned phrases: the built-in ones ("You're absolutely right", "belt-and-suspenders", "belt and
  suspenders", "Great question", "I hope this helps", "Let me know if you'd like", "rest assured", "It's worth
  noting") plus my own. If one slips, restate that sentence without it.
- A comment limit and a reply language, if I set them.

These are instructions Claude follows, not checks, so nothing sends Claude back if it ignores one.

## Install

```
/plugin install course-correct-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`course-correct`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

Nothing happens until the block is in CLAUDE.md, so start with setup:

- `/coach setup` asks which parts I want (loop detector, done-check, style guard) and then offers the CLAUDE.md
  block. It shows the exact text first and only writes it if I say yes.
- `/coach` shows what's on, my banned phrases, limits and whether the block is there and up to date.
- `/coach ban "load-bearing"`, `/coach unban "..."`, `/coach bans`
- `/coach comments 2` (at most 2 comment lines per 10 lines of code), `/coach comments off`
- `/coach language english`, `/coach language off`
- `/coach loop on|off`, `/coach done on|off`, `/coach style on|off`, `/coach loop 2` (wait for the second repeat)
- `/coach block` rewrites the block from my settings, `/coach remove` takes it out.

Saying "stop saying X" or "never write load-bearing" also gets there. After any change it offers to update the
block, because the setting does nothing until the block is rewritten. If `/coach` clashes with something else,
it's `/course-correct-lite:coach`.

## What's different from the code version

- **Loop detector: changed.** The code version compared each command's error with earlier ones and each edit with
  earlier edits, and told Claude on the spot. A code-free hook only sees one tool call at a time (a
  `PostToolUseFailure` prompt hook gets the one error, no history), so it can't tell a repeat. Now it's a rule in the
  CLAUDE.md block, which Claude follows on its own judgement. `/coach loop <n>` changes the rule's wording.
- **Done-check: changed.** The code version kept a "files changed since the last run" flag from every edit, shell
  write and file watcher event, and sent Claude back when it said "done" without a run since. Now it's a rule in the
  CLAUDE.md block. (Version 1.0.0 had a prompt hook at the end of each reply for this; the directory doesn't take
  hooks of any type from unverified organisations, so 1.1.0 dropped it.)
- **Banned phrases (built-in and my own), comment limit, reply language: changed.** The code version checked them;
  now they're instructions in the CLAUDE.md block.
- **Heads-up vs rewrite (`/coach headsup`, `/coach rewrite`): gone.** There's one fixed behaviour: Claude restates the
  sentence with the phrase in one line and avoids it from then on.
- **Toasts and `/coach quiet|loud`: gone.** Nothing code-free can draw a toast.
- **Turning parts off: changed.** `/coach loop|done|style off` changes the CLAUDE.md block. `/coach remove` takes
  it all out.
- **First-run questions: changed.** Nothing code-free runs at session start, so it's `/coach setup` when I want it.
- **Settings: moved** from plugin storage to `~/.claude/course-correct/rules.md`. The code version never wrote a
  file, so there's nothing to carry over.

## What it runs and stores

- **No hooks.** The plugin has no hooks, so nothing runs on its own and there are no extra model calls.
- **`/coach`** is a skill: Claude reads and writes `~/.claude/course-correct/rules.md` and, only after I say yes to
  the exact text, the marked block in `~/.claude/CLAUDE.md`, using its normal Read, Write and Edit tools with the
  usual permission prompts. It never changes anything else in CLAUDE.md and never touches `settings.json`.
- Nothing else is stored or sent.

## Licence

MIT
