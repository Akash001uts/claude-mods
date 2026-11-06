# voice-profile (lite)

This is the code-free version of my voice-profile mod. It's only skills (Markdown), no hooks module, so it works
with the plugin directory's new rules.

## What it does

I ask Claude to help me write a lot of messages: emails to lecturers, replies to recruiters, LinkedIn posts, Slack
messages for my club. Every time, the first draft sounded like Claude and not like me, and I'd spend two or three
rounds going "less formal", "shorter", "I wouldn't say that". This learns how I actually write once, saves it to a
profile file, and uses it whenever I ask for a draft.

## Install

```
/plugin install voice-profile-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`voice-profile`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

- `/write setup` (or "teach Claude my writing style") asks which sources to learn from, in Claude Code's question
  box:
  - Gmail (sent emails)
  - Slack (your messages)
  - LinkedIn posts (links)
  - Assignments and reports (files)

  Tick whichever you want, or type your own under "Other" (say "my blog" or "cover letters I've sent"). Closing the
  question skips setup.
- Claude then goes through each one you picked:
  - **Gmail and Slack:** it reads a sample of your own messages through the connector, skipping auto-replies,
    one-liners and other people's text. If you haven't connected it, you can connect it or paste a few messages
    instead.
  - **LinkedIn:** you give it links to 3 to 5 of your posts and it reads them one at a time. If LinkedIn blocks it,
    you paste the post. It doesn't crawl your profile.
  - **Assignments and reports:** you give it at least 2 files (3 to 5 is better) or a folder.
- It keeps one sample from each source aside, drafts it from the profile and compares, so the profile gets fixed
  where it's off before you use it.
- At the end it shows a one-line summary of each voice (academic, email, LinkedIn, chat) and saves them to
  `~/.claude/voice-profile/profile.md`, which you can open and edit. If there was a profile already, it adds to it
  and keeps a backup first. Then it offers once to add a short pointer to your `~/.claude/CLAUDE.md` (see below).
- After that, just ask normally: "reply to this recruiter", "write a LinkedIn post about the hackathon", "make it
  less formal", "proofread my cover letter". The draft skill picks the voice and how formal to be from who it's for.
  You can still say "as if I don't know them" or "keep it casual" to override it.
- If you give it your own draft, it only makes small fixes and keeps your wording.
- "Remember I never say 'I hope this finds you well'" saves that rule to the profile straight away. "Forget rule 2"
  takes one out. If you keep asking for the same change (say "shorter" three times for emails), it asks once if you
  want that to be the default.
- `/write` shows where your profile is, a summary of each voice and your saved rules (numbered, so "forget rule 2"
  has a target).
- `/write claude-md` adds or removes the CLAUDE.md pointer.

If another plugin also has a `write` skill, use `/voice-profile-lite:write` (and `/voice-profile-lite:write setup`) instead.

## What's different from the code version

- **First-run question: gone.** The code version asked which sources to learn from the first time you opened Claude
  Code. Nothing code-free runs at session start, so now you run `/write setup` yourself.
- **Profile in the system prompt: gone.** The code version put your saved rules and voices into every request, so
  they applied to all writing. Now Claude only sees the profile when the draft skill is used (it reads the file
  fresh every time). That means **saved rules only apply when the skill kicks in**. Its description covers emails,
  Slack, LinkedIn, cover letters, academic writing, editing your drafts and "remember"/"forget" requests, but if
  Claude writes something as you without loading it, the rules won't be there. The fix is the optional CLAUDE.md
  block that setup offers (it's only added if you say yes, and `/write claude-md` removes it). You can also just say
  "use my voice profile".
- **Re-reading on change: changed.** The code checked the file's modified time before each request. Now the skill
  reads the whole file every time it drafts, so hand edits are always picked up.
- **Over-8k trimming: gone.** The code cut long profiles down to summary lines and logged a note. There's no system
  prompt section to fit any more, but setup still keeps the file under about 8,000 characters so each read stays
  cheap.
- **No-profile hint: changed.** The code added a line saying `/write setup` exists. Now the draft skill mentions it
  once after a draft if there's no profile.
- **`/write` and `/write setup`: kept**, as a skill instead of a registered command. `/write claude-md` is new.
- **Setup prompt: changed.** The code submitted a "Set up my voice profile from ..." prompt after you ticked sources.
  Now setup just carries on in the same turn.
- **Stored "already asked" flag: gone**, there's nothing to remember any more.
- **Draft skill, setup steps, profile format, Remembered rules and Nudges: kept** the same, so an existing profile
  works on day one.

## What it runs and stores

- **Files it reads and writes:** `~/.claude/voice-profile/profile.md` and `profile.bak.md` (the copy from before the
  last setup), written by Claude with its normal Read, Write and Edit tools. The profile holds a description of each
  voice plus up to three short excerpts per voice (with phone numbers, emails, IDs and other people's names taken
  out), never whole messages. "Remember" and "forget" requests edit the `## Remembered` list; repeated requests are
  counted in a `## Nudges` table.
- **Optional:** a block between `<!-- voice-profile:start -->` and `<!-- voice-profile:end -->` at the end of
  `~/.claude/CLAUDE.md`, only if you say yes after seeing the exact text.
- **What it reads during setup:** only the sources you tick, through your own Gmail and Slack connectors, web fetches
  of the LinkedIn links you give, and the files or folder you point at, all with your usual permission prompts. The
  samples are read by Claude in that conversation, the same as anything else you share with it; only the summary and
  short excerpts are kept.
- **Gmail:** after an email draft it may offer to save it as a Gmail draft. It never sends anything.
- No hooks, no shell commands, no tools or agents of its own, no plugin storage. Delete the profile file to start
  over.

[Privacy](PRIVACY.md): what it reads and stores, where, who it's shared with and how to delete it.

## Licence

MIT
