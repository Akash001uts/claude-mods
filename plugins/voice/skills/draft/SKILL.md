---
name: draft
description: Draft or edit a message in the user's own voice using their voice profile. Use whenever the user asks to write, draft, reply to, rewrite, shorten, polish or change the tone of an email, message, LinkedIn post, cover letter or piece of academic writing, or says things like "make it less formal", "sound more like me" or "remember I never say X".
---

# Draft in the user's voice

The voice profile is in the system prompt (the `# Voice` section) and on disk at the path given there. The profile
always beats the defaults below.

## 1. Pick the voice

From where it's going, not from asking:

- **Email:** emails, cover letters sent by email, messages to lecturers, recruiters, organisations
- **LinkedIn:** posts, comments, LinkedIn messages and connection notes
- **Chat:** Slack, Teams, Discord, texts, group chats
- **Academic:** assignments, reports, reflections, essays, discussion posts

If the profile has no section for that voice, use the closest one it has and the defaults below.

## 2. Work out familiarity (never ask)

Read it from the request and any thread they paste:

- **Known:** friends, teammates, people they already message casually
- **Warm:** people they've met or worked with, lecturers they know, mentors
- **Cold:** recruiters, people they haven't met, formal contacts

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
- Output the draft directly, ready to send, with a subject line for emails. No preamble and no list of options
  unless they ask.

## 4. Learn from feedback

- **"Remember X"** (or "never do X", "always X"): add it to `## Remembered` in the profile file now with Edit, and
  confirm in one short line.
- **A refinement** ("less formal", "shorter", "drop the exclamation marks"): apply it, then add or bump that row in
  `## Nudges` (voice, direction, count). When a row reaches 3 and isn't marked offered, ask once in one line:
  "You've asked for <direction> in <voice> a few times. Make it the default?" If yes, update that voice's rules. Either
  way, mark the row offered.
- Don't save anything else from the conversation into the profile.
