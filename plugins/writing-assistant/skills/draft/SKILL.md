---
name: draft
description: Draft, reply to or edit a message as the user, in their own voice, using their voice profile. Use when the user asks to write or reply to an email, message, LinkedIn post or comment, cover letter or piece of academic writing that goes out as them, asks to rewrite, shorten or change the tone of their own draft, or says things like "make it less formal", "sound more like me", "remember I never say X" or "forget rule 2".
---

# Draft in the user's voice

The voice profile is in the system prompt (the `# Voice` section) and on disk at the path given there. If the section
says only part of it fits, read the file for the voice you're using before drafting.

What wins, top to bottom:

1. what the user says in this request
2. rules they've set: `## Remembered` and the writing rules in their CLAUDE.md (if these clash, follow CLAUDE.md and
   mention the clash once in one line after the draft)
3. the rest of the profile, which describes how they've written so far (so a habit it records, like dashes, never
   overrides a rule from step 2)
4. the defaults below

## 1. Pick the voice

From where it's going, not from asking:

- **Email:** emails, cover letters sent by email, messages to lecturers, recruiters, organisations
- **LinkedIn:** posts, comments, LinkedIn messages and connection notes
- **Chat:** Slack, Teams, Discord, texts, group chats
- **Academic:** assignments, reports, reflections, essays, discussion posts

If the profile has a section for something more specific (say `## Cover letters`), use that. If it has no section
for that voice, use the closest one it has and the defaults below.

## 2. Work out familiarity (never ask)

Read it from the request and any thread they paste:

- **Known:** friends, teammates, people they already message casually
- **Warm:** people they've met or worked with, lecturers they know, mentors
- **Cold:** recruiters, people they haven't met, formal contacts

The user can override it in plain words ("as if I don't know them", "keep it casual, we're mates"); that wins.

Defaults (the profile's "By familiarity" notes override these):

| | Known | Warm | Cold |
| --- | --- | --- | --- |
| Greeting | "Hey" / name | "Hi" + first name | "Hi" + full name or title |
| Length | short | short to medium | medium, gets to the point |
| Sign-off | none or name | "Regards" + name | "Regards" + name and role |
| Exclamation marks | fine | at most one | none |

## 3. Write it

- Use the voice's own greeting, sign-off, length, punctuation and spelling from the profile. Follow every rule under
  `## Remembered`.
- If the user gives their own draft, make light-touch fixes only (grammar, clarity, tone) and keep their wording.
- **Replies:** answer every question or point in the message they're replying to, in its order, and match its
  language. For email, keep the subject as `Re: <their subject>`.
- **Limits:** LinkedIn connection notes 300 characters, comments short (one to three sentences), Chat messages
  usually one short paragraph. Say so if their own draft is over a hard limit.
- Output the draft directly, ready to send, with a subject line for new emails. No preamble and no list of options
  unless they ask.
- If Gmail connector tools are available and it's an email, you can offer once, after the draft, to save it as a
  Gmail draft. Never send it.

## 4. Learn from feedback

The `## Nudges` table isn't in the system prompt: read the file before updating it.

- **"Remember X"** (or "never do X", "always X"): add it to `## Remembered` in the profile file now with Edit, and
  confirm in one short line.
- **"Forget rule N"** (numbered as `/voice` shows them) or "forget that I ...": remove that line from
  `## Remembered` and confirm in one short line.
- **A refinement** ("less formal", "shorter", "drop the exclamation marks"): apply it, then add or bump that row in
  `## Nudges` (voice, direction, count). When a row reaches 3 and isn't marked offered, ask once in one line:
  "You've asked for <direction> in <voice> a few times. Make it the default?" If yes, update that voice's rules. Either
  way, mark the row offered.
- Don't save anything else from the conversation into the profile.
