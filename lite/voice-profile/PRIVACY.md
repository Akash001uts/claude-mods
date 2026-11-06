# Privacy: voice-profile (lite)

Last updated 7 November 2026.

voice-profile (lite) is a set of instructions for Claude Code on your own computer. I don't run a server for it, and
it doesn't collect anything or send anything to me. It has no code: everything is done by Claude with its normal
tools, under Claude Code's usual permission prompts.

## What it reads

- Your profile, `~/.claude/voice-profile/profile.md`, each time you ask for a draft or run `/write`.
- During setup, only the sources you tick:
  - **Gmail and Slack:** a sample of your own sent messages, through your own connectors.
  - **LinkedIn:** the links to your posts that you give it, fetched one at a time (or the text you paste).
  - **Assignments and reports:** the files or folder you point it at.
- These samples can include names, email addresses and other personal details, the same as anything else you share
  with Claude.

## What it stores, and where

Everything stays on your computer:

- `~/.claude/voice-profile/profile.md`: a description of each of your voices (academic, email, LinkedIn, chat), your
  saved rules, and up to three short excerpts per voice. Phone numbers, email addresses, IDs and other people's names
  are taken out of the excerpts, and whole messages are never kept.
- `~/.claude/voice-profile/profile.bak.md`: the copy from before the last setup.
- Optionally, a short block in `~/.claude/CLAUDE.md` pointing at the profile, only if you say yes after seeing the
  exact text.

## Who it's shared with

- Anthropic, through Claude Code: the samples Claude reads during setup and your profile when it drafts become part
  of your conversation, under your Claude account's terms and Anthropic's privacy policy.
- Gmail, only if you say yes when it offers to save an email draft as a Gmail draft. It never sends anything.
- Nobody else.

## How long it's kept

Until you delete it. Delete `~/.claude/voice-profile/` to remove the profile, and the marked block from
`~/.claude/CLAUDE.md` if you added it (`/write claude-md` can take it out).

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
