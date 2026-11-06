# tool-guards (lite)

This is the code-free version of my tool-guards mod. The original checked Claude's tool calls with a hooks module,
which the plugin directory doesn't take from me any more, so this one does the same job with only a prompt hook, a
skill and a couple of Claude Code settings.

## What it does

Two things Claude does with its tools that keep coming up in the GitHub issues:

- It edits files through the shell (`sed -i`, `cat > file`) instead of its Edit tool, which means `/rewind` can't
  undo them. This mod refuses those commands and tells Claude to use Edit or Write instead.
- It puts its own attribution (a Co-Authored-By trailer, "Generated with Claude Code", a link to the session) in your
  commits and PRs. This mod refuses a commit or PR command with those lines, and `/guards` can turn the attribution
  off at the source with Claude Code's own setting.

The third guard from the code version (asking before a huge read) can't be done without code, so here it's an
optional rule in your CLAUDE.md. That's advice to Claude, not a guard.

## Install

```
/plugin install tool-guards-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`tool-guards`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

The hook is on as soon as the plugin is enabled, nothing to set up. Then, once:

```
/guards setup
```

That goes through three optional changes, one at a time, and shows you the exact text before writing anything:

1. `"attribution": false` in `~/.claude/settings.json`, so Claude Code stops asking Claude to add the lines at all
   (needs Claude Code 2.1.281 or later).
2. Permission deny rules for the common shell edits (`sed -i`, `sed --in-place`, `perl -i`, `perl -pi`, and
   PowerShell ones if you want them). These are real blocks with no model call, but they're blunt (a `sed -i` on a
   temp file gets blocked too).
3. A big-reads rule in `~/.claude/CLAUDE.md` (between `<!-- tool-guards:start -->` and `<!-- tool-guards:end -->`)
   telling Claude to check a file's size and read a range when it's big.

It backs up `settings.json` to `~/.claude/settings.json.tool-guards.bak` before changing it.

Commands (if `/guards` clashes with something else, it's `/tool-guards-lite:guards`):

- `/guards` shows what's on.
- `/guards setup` goes through all three.
- `/guards attribution` turns off Claude Code's attribution setting.
- `/guards deny` adds the deny rules.
- `/guards reads on|off` adds or removes the big-reads rule.
- `/guards off` explains how to turn a guard off.

You can also just say things like "what guards are on" or "stop Claude adding Co-Authored-By".

**What the hook catches.** Shell edits: `sed -i`, `perl -i`, redirects into a file (`>`, `>>`, heredocs into a
file), `tee`, and PowerShell's `Set-Content`, `Add-Content`, `Out-File` and `>`. Not caught: reads (`sed -n`, `cat`,
`grep`, `Get-Content`), anything going to `/dev/null` or `$null`, writes into temp or scratch folders, and programs
that write files as their normal job (git, npm, compilers, `cp`, `mv`). Attribution: a `git commit` or
`gh pr create|edit` whose text has a Co-Authored-By: Claude line, "Generated with Claude Code" or a claude.ai/code
link. When it refuses, Claude gets the reason as the tool error and redoes it properly.

**Turning it off.** The hook covers both shell edits and attribution, and there's no per-guard switch without code,
so to turn it off you disable the plugin in `/plugin`. `/guards off` can also take the settings back out.

## What's different from the code version

- **Shell edits guard:** kept, changed how. The code matched the command with regexes; now a small model reads each
  Bash or PowerShell command and decides. It's told to let it through when unsure, so it might miss an odd write
  sometimes, and it costs a model call (a second or two) on every shell command. The optional deny rules are the
  hard backstop.
- **"Auto mode only" (`/guards edits auto|always`):** gone. It's always on while the plugin is enabled.
- **Attribution at the source:** changed how. The code blanked the attribution text Claude Code gives Claude. Now
  that's the `"attribution": false` setting, which `/guards attribution` writes with your OK.
- **Attribution safety net:** changed. The code took the lines out of the command quietly and ran it ("fix" mode).
  A prompt hook can't rewrite a command, so now it's always refuse mode: the command is refused and Claude reruns it
  without the lines. `/guards attribution fix|refuse` is gone.
- **Commit message from a file (`git commit -F`, `--body-file`):** gone. The code read that file to check it; the
  prompt hook can't read files, so those aren't checked (the attribution setting still stops the lines at the
  source).
- **Big reads (ask before a read of 25%+ of the context left):** gone as a guard. There's no code-free way to know a
  file's size or the context left before a Read. Replaced by an optional CLAUDE.md rule, which is advice only.
- **Note after a huge command output:** gone (it needed the context numbers).
- **First-run question:** gone. Nothing code-free runs at session start, so you run `/guards setup` yourself.
- **Notes (toasts) and `/guards quiet|loud`:** gone. A plugin without code can't draw anything. You just see the tool
  error in the transcript.
- **Settings in plugin storage:** gone. The only settings now are Claude Code's own (`settings.json`, CLAUDE.md).
- **If the check fails:** the code refused the command. With a prompt hook that's down to Claude Code, and the hook
  might let the command through if the model call fails or times out (30 seconds).

## What it runs and stores

- **The hook.** One prompt hook on `PreToolUse` for `Bash` and `PowerShell`. Each time Claude runs a shell command,
  Claude Code sends that command (and the hook's input, like the working folder) to a small Claude model to judge it.
  That's a model call per shell command, through your normal Claude Code account, so it goes to Anthropic like the
  rest of your session. Nothing else is sent anywhere. The plugin directory might still flag hooks.
- **What it reads.** Through Claude's normal tools when you run `/guards`: `~/.claude/settings.json`,
  `~/.claude/CLAUDE.md`, and the output of `claude --version`.
- **What it writes, only after you say yes to the exact change:** `"attribution": false` and `permissions.deny`
  rules in `~/.claude/settings.json` (backed up first to `~/.claude/settings.json.tool-guards.bak`), and the
  `tool-guards` block in `~/.claude/CLAUDE.md`. Claude does these with its Edit tool, so you also get Claude Code's
  normal permission prompts.
- **What it refuses.** Shell commands that write files, and commits or PRs with attribution lines, with the reason.
- It doesn't run commands on its own, rewrite commands, or store anything of its own.

## Licence

MIT
