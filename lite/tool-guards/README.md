# tool-guards (lite)

This is the code-free version of my tool-guards mod. The original checked Claude's tool calls with a hooks module,
which the plugin directory doesn't take from me any more. Version 1.0.0 of this one used a prompt hook instead, but
the directory doesn't take hooks of any type from unverified organisations either, so now it's only a skill that
sets up Claude Code's own settings and a few CLAUDE.md rules.

## What it does

Two things Claude does with its tools that keep coming up in the GitHub issues:

- It edits files through the shell (`sed -i`, `cat > file`) instead of its Edit tool, which means `/rewind` can't
  undo them. This mod adds permission deny rules for the common ones and a CLAUDE.md rule for the rest.
- It puts its own attribution (a Co-Authored-By trailer, "Generated with Claude Code", a link to the session) in your
  commits and PRs. `/guards` turns that off at the source with Claude Code's own setting, plus a CLAUDE.md rule.

The third guard from the code version (asking before a huge read) can't be done without code, so it's an optional
rule in your CLAUDE.md too. The CLAUDE.md rules are advice to Claude, not guards; the settings are real.

## Install

```
/plugin install tool-guards-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`tool-guards`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

Nothing is on until you set it up, once:

```
/guards setup
```

That goes through three optional changes, one at a time, and shows you the exact text before writing anything:

1. `"attribution": false` in `~/.claude/settings.json`, so Claude Code stops asking Claude to add the lines at all
   (needs Claude Code 2.1.281 or later).
2. Permission deny rules for the common shell edits (`sed -i`, `sed --in-place`, `perl -i`, `perl -pi`, and
   PowerShell ones if you want them). These are real blocks, but they're blunt (a `sed -i` on a temp file gets
   blocked too) and they can't catch redirects.
3. A rules block in `~/.claude/CLAUDE.md` (between `<!-- tool-guards:start -->` and `<!-- tool-guards:end -->`) with
   the ones you pick: use Edit or Write instead of shell writes, no attribution in commits and PRs, and check a
   file's size before reading it.

It backs up `settings.json` to `~/.claude/settings.json.tool-guards.bak` before changing it.

Commands (if `/guards` clashes with something else, it's `/tool-guards-lite:guards`):

- `/guards` shows what's on.
- `/guards setup` goes through all three.
- `/guards attribution` turns off Claude Code's attribution setting.
- `/guards deny` adds the deny rules.
- `/guards rules` adds or updates the CLAUDE.md block, `/guards rules off` removes it.
- `/guards reads on|off` adds or drops just the big-reads rule.
- `/guards off` explains how to turn a guard off.

You can also just say things like "what guards are on" or "stop Claude adding Co-Authored-By".

**Turning it off.** `/guards off` takes the settings and the CLAUDE.md rules back out, one at a time.

## What's different from the code version

- **Shell edits guard:** changed. The code matched every shell command with regexes and refused writes into files.
  Now it's deny rules for `sed -i` and `perl -i` (real, but they can't tell a temp file apart) plus a CLAUDE.md rule
  for the rest, which Claude follows but nothing checks. Version 1.0.0 had a prompt hook on every shell command for
  this; the directory doesn't take hooks of any type from unverified organisations, so 1.1.0 dropped it.
- **"Auto mode only" (`/guards edits auto|always`):** gone.
- **Attribution at the source:** changed how. The code blanked the attribution text Claude Code gives Claude. Now
  that's the `"attribution": false` setting, which `/guards attribution` writes with your OK.
- **Attribution safety net:** changed. The code took the lines out of a commit or PR command before it ran. Now
  it's a CLAUDE.md rule, as a second layer behind the setting. `/guards attribution fix|refuse` is gone.
- **Big reads (ask before a read of 25%+ of the context left):** gone as a guard. There's no code-free way to know a
  file's size or the context left before a Read. Replaced by an optional CLAUDE.md rule, which is advice only.
- **Note after a huge command output:** gone (it needed the context numbers).
- **First-run question:** gone. Nothing code-free runs at session start, so you run `/guards setup` yourself.
- **Notes (toasts) and `/guards quiet|loud`:** gone. A plugin without code can't draw anything. You just see the tool
  error in the transcript.
- **Settings in plugin storage:** gone. The only settings now are Claude Code's own (`settings.json`, CLAUDE.md).

## What it runs and stores

- **No hooks.** The plugin has no hooks, so nothing runs on its own and there are no extra model calls.
- **What it reads.** Through Claude's normal tools when you run `/guards`: `~/.claude/settings.json`,
  `~/.claude/CLAUDE.md`, and the output of `claude --version`.
- **What it writes, only after you say yes to the exact change:** `"attribution": false` and `permissions.deny`
  rules in `~/.claude/settings.json` (backed up first to `~/.claude/settings.json.tool-guards.bak`), and the
  `tool-guards` block in `~/.claude/CLAUDE.md`. Claude does these with its Edit tool, so you also get Claude Code's
  normal permission prompts.
- It doesn't run commands on its own, rewrite commands, or store anything of its own.

## Licence

MIT
