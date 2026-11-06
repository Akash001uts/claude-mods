---
name: write
description: Show the user's voice profile (/write) or set it up and add sources (/write setup), or add or remove the CLAUDE.md pointer (/write claude-md).
argument-hint: "[setup | claude-md]"
disable-model-invocation: true
---

# /write

The user typed `/write $ARGUMENTS`. The profile is `~/.claude/voice-profile/profile.md` (on Windows,
`%USERPROFILE%\.claude\voice-profile\profile.md`). Branch on the first word of the arguments, ignoring case.

## No arguments: show the profile

Read the profile file. Don't change it. Then show exactly this shape, plainly, with nothing before or after:

```
Profile: <full path>
Voices:
  <heading>: <its Summary: line, or "(no summary line)">
Remembered:
  1. <rule>
  2. <rule>
/write setup adds sources. Ask Claude to forget a rule by number, or edit the file.
```

- **Voices** are every `## ` section except ones whose heading starts with "Remembered" or "Nudges" (case doesn't
  matter), in file order. None: `Voices: none yet`.
- **Remembered** rules are only the bullet lines (starting `- ` or `* `) under the `## Remembered` heading, numbered
  from 1 in file order, with the bullet taken off. None: `Remembered: nothing yet`. These numbers are the ones
  "forget rule N" uses, so count exactly this way.
- If there's text above the first `## ` heading other than the `# ` title, add a line `Notes: <first line of it>`.
- Never show the `## Nudges` table.
- If the file has no `## ` sections at all: `Profile: <path>` then `It has no "## " sections, so Claude reads it as
  written. /write setup adds sources.`
- If the file doesn't exist: `No voice profile yet. /write setup learns how you write.`

## `setup`: learn from sources

Invoke the `voice-profile-lite:setup` skill with the Skill tool and follow it. It asks which sources to use.

## `claude-md`: add or remove the CLAUDE.md pointer

Read `~/.claude/CLAUDE.md`.

- If it has a `<!-- voice-profile:start -->` ... `<!-- voice-profile:end -->` block, show it and ask whether to
  remove it. Only on yes, remove exactly that block (and the blank line before it) with Edit, and confirm in one line.
- If it doesn't, show the block from step 7 of the setup skill and ask whether to add it. Only on yes, append it to the
  end of the file (create the file if needed) and confirm in one line.

## Anything else

Reply with only: `Usage: /write [setup | claude-md]`
