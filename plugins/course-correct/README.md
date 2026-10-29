# course-correct

Three things Claude does that annoy me: it goes round in circles fixing the same error, it says "done, that works"
without running anything, and it slips back into habits I've asked it to drop ("You're absolutely right",
comment-heavy code). course-correct watches for those and adds a short note for Claude when one happens. It never blocks or
undoes anything. Its command is `/coach`.

## Install

```
/plugin install course-correct --marketplace Akash001uts/claude-mods
```

## How it works

- **First run** asks which parts to turn on (loop detector, done-check, style guard; tick any or all), then who sees
  the notes: only Claude, or Claude and you (as a toast, like "course-correct: same error came back after the fix, told Claude
  to step back").
- **Loop detector.** If a command gives the same error after Claude changed files to fix it, or Claude makes the exact
  same edit to a file again, Claude gets: "This is the same error as before your last fix. Stop editing. Explain what
  is actually going wrong, give two different approaches, then pick one." Errors are compared on their key line with
  numbers, paths and quoted names taken out, so a moved line number still counts as the same error. It fires on the
  first repeat; `/coach loop 2` (or more) waits longer.
- **Done-check.** Coach keeps one flag: files changed since the last check. Edits by Claude, shell commands that write
  files, and changes Claude Code reports in the project folder (from you, Codex, another tool) set it; running tests, a
  build, a type check, a linter or the program itself clears it. When Claude finishes a turn with the flag set, one
  small model call asks whether the reply claims the work is finished or working. If it does, course-correct sends Claude a
  follow-up: "You said this works, but nothing has run since the files changed. Run it, or say clearly that it is
  untested." At most one check per turn, none on course-correct's own follow-up, and it's skipped in projects with no tests
  (no test folder, test config or `test` script).
- **Style guard.** Four rule sources, all yours:
  1. A built-in list of the stock phrases people complain about ("You're absolutely right", "belt-and-suspenders",
     "Great question", "I hope this helps" and a few more). `/coach bans` lists them, `/coach unban "..."` drops one.
  2. Your own list: `/coach ban "load-bearing"`.
  3. A comment limit: `/coach comments 2` allows 2 comment lines per 10 lines of code in one edit. Off until set.
  4. A reply language: `/coach language english`. Off until set. It's a simple check of which language most of the
     reply is in, with no model call.
  Phrases are matched as whole words, ignoring case. Code Claude writes is checked as it's written (the note goes
  with the edit's result, so Claude sees it straight away). Replies are checked at the end of the turn: by default
  Claude gets a heads-up with your next message and avoids it from then on. `/coach rewrite` has Claude redo the
  reply at once instead; `/coach headsup` goes back.

## Commands

- `/coach` shows what's on. `/coach loop|done|style on|off` turns a part on or off, `/coach loop <n>` sets the repeats.
- `/coach quiet` sends notes to Claude only; `/coach loud` shows them to you too.
- `/coach ban "<phrase>"`, `/coach unban "<phrase>"`, `/coach bans`, `/coach comments <n>|off`,
  `/coach language <name>|off`, `/coach rewrite`, `/coach headsup`, `/coach setup`.

Settings are per user: the same rules apply in every project.

## What it runs and stores

- **What it reads.** Claude's replies, and the tool calls of each turn (the command or edit, and what came back).
  Which project files changed (names only). Whether the project has tests: it lists the project folder, two levels
  down, and reads `package.json` for a `test` script.
- **What it sends.** The done-check's call carries the end of Claude's reply (up to 4,000 characters) and the names of
  the changed files, through Claude Code to Anthropic, and gets back only a yes or no. Nothing else is sent.
- **What it puts into the session.** Notes for Claude: on a tool call's result (loop and code notes), with your next
  message (style heads-up), or as a follow-up message from course-correct (done-check, and style in rewrite mode). Each one
  starts with "course-correct:".
- **What it puts in the prompts it submits.** It submits a prompt in two cases only, and neither carries the
  conversation, a file or anything it read:
  - The done-check, word for word: "course-correct: You said this works, but nothing has run since the files
    changed. Run it (tests, a build or the program itself), or say clearly that it is untested."
  - A style rewrite, only with `/coach rewrite` on: "course-correct: Your last reply used "<phrase>", which the user
    asked you not to use, and was in <language>; the user wants replies in <language>. Write it again without that,
    changing nothing else." The phrases are from the built-in list or your own `/coach ban` list, and the languages
    are the one detected and the one you set. Nothing else is added.
- **What it stores.** Your settings and phrase lists, in Claude Code's plugin storage.
- It never blocks or changes a tool call, never runs commands and never changes settings.

## What each hook does

The mod is `hooks/register.tsx`, with the checks in `hooks/checks.ts`. It hooks these events and nothing else:

- `session.start`: registers `/coach`, asks the first-run questions once, and looks for tests in the project.
- `classic.SessionStart`: with the done-check on, asks Claude Code to watch the project folder (`watchPaths`), so
  changes made outside Claude count. It passes the event on with `next(e)` and returns that result unchanged apart
  from adding the project folder to `watchPaths`. It takes no permission decision and changes no settings,
  instructions or other hooks' output.
- `classic.FileChanged`: notes the changed file's name. Changes nothing.
- `tool.call`: lets every call run as it is, then reads what came back. For a repeated error or edit, or code that
  breaks your style rules, it adds a note for Claude to the result. The result itself is never changed.
- `prompt.submit`: adds a waiting style heads-up to your next message as context Claude reads. Your words are not
  changed. It also notes whether the prompt is course-correct's own follow-up, so the checks skip that turn.
- `turn.complete`: runs the done-check and the reply checks at the end of Claude's turn. The answer shown is not changed.
- `command.run` (`/coach` only): answers the command.
