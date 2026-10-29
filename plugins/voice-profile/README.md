# voice-profile

I ask Claude to help me write a lot of messages: emails to lecturers, replies to recruiters, LinkedIn posts, Slack
messages for my club. Every time, the first draft sounded like Claude and not like me, and I'd spend two or three
rounds going "less formal", "shorter", "I wouldn't say that". This mod learns how I actually write once, and then
uses it every time I ask for a draft.

## Install

```
/plugin install voice-profile --marketplace Akash001uts/claude-mods
```

## How it works

- The first time you open Claude Code after installing it, you get one list to tick:
  - Gmail (sent emails)
  - Slack (your messages)
  - LinkedIn posts (links)
  - Assignments and reports (files)

  Tick whichever ones you want and the rest are skipped. You can also type your own under "Other" (say "my blog" or
  "cover letters I've sent"). If you close the list, nothing happens, and `/write setup` brings it back whenever you
  want. If you quit before the list shows up, it asks again next time.
- Claude then goes through each one you picked:
  - **Gmail and Slack:** it reads a sample of your own messages through the connector, skipping auto-replies,
    one-liners and other people's text. If you haven't connected it, you can connect it or paste a few messages
    instead.
  - **LinkedIn:** you give it links to 3 to 5 of your posts and it reads them one at a time. If LinkedIn blocks it,
    you paste the post. It doesn't crawl your profile.
  - **Assignments and reports:** you give it at least 2 files (3 to 5 is better) or a folder.
- It keeps one sample from each source aside, drafts it from the profile and compares, so the profile gets fixed
  where it's off before you ever use it.
- At the end it shows a one-line summary of each voice it picked up (academic, email, LinkedIn, chat), and saves them
  to a profile file you can open and edit. If there was a profile already, it adds to it and keeps a backup first.
- After that there are no commands. Just ask normally ("reply to this recruiter", "write a LinkedIn post about the
  hackathon", "make it less formal") and it picks the right voice and how formal to be, based on who it's for. You
  can still say "as if I don't know them" or "keep it casual" to override it.
- If you give it your own draft, it only makes small fixes and keeps your wording.
- "Remember I never say 'I hope this finds you well'" saves that rule to your profile straight away. "Forget rule 2" takes one out. If you keep asking for the same change (say "shorter" three times for
  emails), it asks once if you want that to be the default.
- `/write` shows where your profile is, a summary of each voice and your saved rules (numbered). `/write setup` adds
  more sources later without wiping what's there.

## What it runs and stores

- **What it asks.** In the first session after install (not under `claude -p`), one question in Claude Code's own
  question box: which sources to learn from. It only asks on its own until you answer or close it. `/write setup`
  asks again.
- **What it puts in the prompts it submits.** It submits one prompt, and only after you tick sources in the setup
  list (or in `/write setup`):

  ```
  Set up my voice profile from: [the sources you ticked]. Use the voice-profile:setup skill. Profile file: [path]
  ```

  That's all it holds: the names of the sources you ticked, anything you typed under "Other" (cut to 200
  characters), and the profile's path. It never puts the profile's contents, your environment variables or anything
  else it reads into a prompt, and it doesn't submit any other prompt. Claude then reads only those sources, using your own connectors and tools, with your usual permission
  prompts. The emails, messages and files it samples are read by Claude in that conversation, the same as anything
  else you share with it; only the summary and short excerpts are kept.
- **What it reads.** The `USERPROFILE` (or `HOME`) environment variable, to find your home folder, and the profile file
  at `~/.claude/voice-profile/profile.md`. It checks the file's size and modified time whenever Claude Code builds its
  system prompt and re-reads it only when it changed.
- **What it adds to the system prompt.** If you have a profile, one section with your saved rules and your voices
  (just the summary lines if the profile is over 8,000 characters), and a note telling Claude to use the draft skill
  for writing requests. The table it uses to count repeated requests stays out. Without a profile, a single line
  saying `/write setup` exists.
- **What it stores.** The profile file (and `profile.bak.md`, the copy from before the last setup) is written by
  Claude, not by the mod. It holds a description of each voice plus up to three short excerpts per voice (with phone
  numbers, emails, IDs and other people's names taken out), never whole messages. The mod itself only stores one
  value in plugin storage, so it knows whether it's asked you yet.
- It doesn't run shell commands, register tools or agents, or change your prompts. Delete the profile file to start
  over.

## What each hook does

- **`session.start`**: registers the `/write` command (its only command), reads the profile, and in the first
  interactive session with no profile, asks the setup question once (see above).
- **`prompt.compose`**: adds the one section described under "What it adds to the system prompt". It leaves the rest
  of the system prompt, your settings, instructions, other hooks' sections and tool descriptions as they are.
- **`command.run`**: only for `/write`. On its own it shows your profile summary; `/write setup` asks the setup
  question again. It doesn't see or change any other command.
- **`prompt.submit`**: it doesn't hook this. It only calls it once, to send the setup prompt shown under "What it puts
  in the prompts it submits".

## Licence

MIT
