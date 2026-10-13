# voice

I ask Claude to help me write a lot of messages: emails to lecturers, replies to recruiters, LinkedIn posts, Slack
messages for my club. Every time, the first draft sounded like Claude and not like me, and I'd spend two or three
rounds going "less formal", "shorter", "I wouldn't say that". This mod learns how I actually write once, and then
uses it every time I ask for a draft.

## How it works

- The first time you open Claude Code after installing it, you get one list to tick:
  - Gmail (sent emails)
  - Slack (your messages)
  - LinkedIn posts (links)
  - Assignments and reports (files)

  Tick whichever ones you want and the rest are skipped. If you close the list, nothing happens, and `/voice setup`
  brings it back whenever you want.
- Claude then goes through each one you ticked:
  - **Gmail and Slack:** it reads a sample of your own messages through the connector. If you haven't connected it,
    you can connect it or paste a few messages instead.
  - **LinkedIn:** you give it links to 3 to 5 of your posts and it reads them one at a time. If LinkedIn blocks it,
    you paste the post. It doesn't crawl your profile.
  - **Assignments and reports:** you give it at least 2 files (3 to 5 is better) or a folder.
- At the end it shows a one-line summary of each voice it picked up (academic, email, LinkedIn, chat), and saves them
  to a profile file you can open and edit.
- After that there are no commands. Just ask normally ("reply to this recruiter", "write a LinkedIn post about the
  hackathon", "make it less formal") and it picks the right voice and how formal to be, based on who it's for.
- If you give it your own draft, it only makes small fixes and keeps your wording.
- "Remember I never say 'I hope this finds you well'" saves that rule straight away. If you keep asking for the same
  change (say "shorter" three times for emails), it asks once if you want that to be the default.
- `/voice` shows where your profile is and which voices it has. `/voice setup` adds more sources later without
  wiping what's there.

## What it runs and stores

- **What it asks.** In the first session after install (not under `claude -p`), one question in Claude Code's own
  question box: which sources to learn from. It only asks once on its own. `/voice setup` asks again.
- **What it sends to Claude.** If you tick something, it submits one prompt asking Claude to run the setup skill. That
  prompt only has the names of the sources you ticked and the profile's path. Claude then reads only those sources,
  using your own connectors and tools, with your usual permission prompts.
- **What it reads.** The `USERPROFILE` (or `HOME`) environment variable, to find your home folder, and the profile file
  at `~/.claude/voice/profile.md`, once at the start of each session.
- **What it adds to the system prompt.** If you have a profile, one section with the profile and a note telling Claude
  to use the draft skill for writing requests. Without one, a single line saying `/voice setup` exists.
- **What it stores.** The profile file is written by Claude, not by the mod. It holds a description of each voice
  plus up to three short excerpts per voice (with phone numbers, emails, IDs and other people's names taken out),
  never whole messages. The mod itself only stores one flag in plugin storage so it doesn't ask again.
- It doesn't run commands, register tools, change your prompts or send anything outside Claude Code. Delete the
  profile file to start over.

## Licence

MIT
