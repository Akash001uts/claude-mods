---
name: setup
description: Learn how the user writes and save it as their voice profile. Use when the voice plugin asks to set up a voice profile from a list of sources (Gmail, Slack, LinkedIn posts, assignments and reports), or when the user asks to teach Claude their writing style.
argument-hint: "[sources]"
---

# Voice setup

The prompt that started this names the sources the user ticked and the profile file. Only touch those sources. Go
through them one at a time, in the order given, and keep each step short: say what you need, get it, move on.

## 1. Collect samples, one source at a time

Use only lines the user wrote themselves. In a thread, skip everyone else's messages and quoted replies.

- **Gmail:** if Gmail connector tools are available, search their sent mail (`in:sent`, newest first) and read 10 to
  15 emails, mixing who they're to (lecturers, recruiters, friends) if you can. If there's no connector, ask them to
  connect Gmail, or to paste 3 to 5 emails they've sent.
- **Slack:** if Slack connector tools are available, search for messages from the user and read 20 to 30 of them
  across a few channels and DMs. If there's no connector, ask them to connect Slack or paste some messages.
- **LinkedIn posts:** ask for links to 3 to 5 of their own posts and fetch each one on its own. If a fetch fails (it
  often hits a login wall), ask them to paste that post. Never crawl or browse a whole profile.
- **Assignments and reports:** ask for **at least 2 files, ideally 3 to 5** (pdf, docx, md, txt), or a folder. Read
  pdf, md and txt directly. For docx, use a docx skill if one is available; otherwise ask for a pdf export or a paste.
  If they give only one, ask for one more, but carry on with one if they'd rather. Skip reference lists, tables and
  quoted sources: only their own prose counts.

## 2. Work out each voice

The voices are **Academic** (assignments and reports), **Email** (Gmail), **LinkedIn** (posts) and **Chat**
(Slack). For each one with samples, note:

- greeting and sign-off (exact words, and how they change with who it's to)
- typical length, and sentence and paragraph length
- formality: contractions, slang, first person, active or passive
- punctuation habits: exclamation marks, dashes, emoji, lists
- spelling variant (Australian, British, American)
- phrases they use often, and things they never do
- how it shifts between close contacts, people they've met, and strangers

Describe what's there. Don't improve it or judge it.

## 3. Write the profile

Write to the profile file named in the prompt (create the folder if needed). If it already exists, read it first and
**add to it**: update the voices you have new samples for and keep everything else, including `## Remembered` and
`## Nudges`. Use this shape:

```markdown
# Voice profile

## Email
Summary: <one line, e.g. "short, 'Hi' + first name, no exclamation marks, signs off 'Regards, <name>'">
- Greeting: ...
- Sign-off: ...
- Length: ...
- Formality: ...
- Punctuation: ...
- Spelling: ...
- Uses: "...", "..."
- Avoids: ...
- By familiarity: ...
Excerpts:
> <up to 3 short lines of theirs, under 200 characters each>

## Academic
...

## Remembered
- <rules the user has asked to keep>

## Nudges
| Voice | Direction | Count | Offered |
| --- | --- | --- | --- |
```

Excerpts are the only raw text kept. Before saving one, take out phone numbers, email addresses, student or staff
IDs, passwords, addresses, dates of birth and other people's names. Never copy whole messages into the profile.

## 4. Finish

Show one summary line per voice you learned, say the profile is at `<path>` and can be edited by hand, and say
that `/voice setup` adds more sources later. Then stop.
