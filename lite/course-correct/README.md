# course-correct (lite)

This is the code-free version of course-correct. The full one is a hooks module, and the plugin directory only
takes those from Verified organisations, so this one is just a hook prompt, a skill and a CLAUDE.md block. I'm
using it for a while to see if it's good enough.

## What it does

Three things Claude does that annoy me: it goes round in circles fixing the same error, it says "done, that works"
without running anything, and it slips back into habits I've asked it to drop ("You're absolutely right",
comment-heavy code).

- **End-of-reply check (the plugin's Stop hook).** Every time Claude finishes a reply, one small model call reads
  that final message. It sends Claude back if:
  - the reply says changed code is done or working but doesn't report running anything (tests, a build, the
    program) and doesn't say it's untested. Claude gets: "course-correct: You said this works, but nothing shows it
    was run since the files changed. Run it (tests, a build or the program itself), or say clearly that it is
    untested."
  - the reply uses one of the built-in phrases: "You're absolutely right", "belt-and-suspenders", "belt and
    suspenders", "Great question", "I hope this helps", "Let me know if you'd like", "rest assured", "It's worth
    noting". Claude gets told which one and restates just that sentence in one line.

  It never checks its own follow-up, so it can't loop.
- **The CLAUDE.md block (optional, with `/coach`).** A marked block in `~/.claude/CLAUDE.md` with the rest: stop
  after the same error comes back after a fix (or the same edit again) and explain, give two approaches, pick one;
  run before saying it works; my own banned phrases; a comment limit; a reply language.

## Install

```
/plugin install course-correct-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`course-correct`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

The end-of-reply check starts working as soon as it's installed. For the rest:

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
  write and file watcher event, and only checked in projects with tests. A Stop hook only gets Claude's final
  message, not the turn's tool calls, so now it judges from the reply text alone: if the reply says it changed code
  and it works but doesn't mention running anything, Claude is sent back. So if Claude did run the tests but didn't
  say so, it gets sent back once and just says what it ran. There's no "skip projects without tests" any more, but
  the note lets Claude say it's untested. I thought about an agent hook that reads the transcript to see the real
  tool calls, but that's a multi-turn subagent on every single stop and agent hooks are experimental, so no.
- **Built-in banned phrases: kept** in the hook, for replies. Code isn't checked by the hook (that would be a model
  call on every edit); the CLAUDE.md block covers code.
- **`/coach unban` of a built-in phrase: partly gone.** It's dropped from the CLAUDE.md block, but the hook's list is
  fixed, so the hook still flags it.
- **My own bans, comment limit, reply language: changed.** The hook prompt can't read any file, so these are only
  enforced through the CLAUDE.md block, as instructions rather than checks.
- **Heads-up vs rewrite (`/coach headsup`, `/coach rewrite`): gone.** There's one fixed behaviour: Claude restates the
  sentence with the phrase in one line and avoids it from then on.
- **Toasts and `/coach quiet|loud`: gone.** Nothing code-free can draw a toast. When the hook sends Claude back, the
  reason shows in the transcript as Stop hook feedback, so I still see it.
- **Turning parts off: changed.** `/coach loop|done|style off` changes the CLAUDE.md block. The end-of-reply check
  runs while the plugin is enabled; `/plugin disable course-correct-lite` is the only off switch for it.
- **First-run questions: changed.** Nothing code-free runs at session start, so it's `/coach setup` when I want it.
- **Settings: moved** from plugin storage to `~/.claude/course-correct/rules.md`. The code version never wrote a
  file, so there's nothing to carry over.

## What it runs and stores

- **The Stop hook** is a prompt hook: at the end of every reply Claude Code sends the hook's prompt plus the event
  data (my session id, the folder, the transcript path, and Claude's final message) to Claude's background model,
  through Claude Code to Anthropic, and gets back ok or not ok with a reason. That's one extra model call every time
  Claude stops, which adds a bit of time. It runs no commands and reads no files. Hooks in a plugin might still get
  flagged by the plugin directory.
- **`/coach`** is a skill: Claude reads and writes `~/.claude/course-correct/rules.md` and, only after I say yes to
  the exact text, the marked block in `~/.claude/CLAUDE.md`, using its normal Read, Write and Edit tools with the
  usual permission prompts. It never changes anything else in CLAUDE.md and never touches `settings.json`.
- Nothing else is stored or sent.

## Licence

MIT
