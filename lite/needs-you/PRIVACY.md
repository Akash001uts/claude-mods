# Privacy: needs-you (lite)

Last updated 7 November 2026.

needs-you (lite) is a skill for Claude Code on your own computer. I don't run a server for it, and it doesn't collect
anything or send anything to me. It has no code: setup is done by Claude with its normal tools, and the alerts come
from one hook in your own Claude Code settings that calls your own claude.ai Slack connector.

## What it reads

- During setup, through your claude.ai Slack connector: your own Slack profile (your user id and first name).
- Your `~/.claude/settings.json`, to add, check or remove its one hook entry.
- When an alert fires, Claude Code fills in its own notification text (like "Claude needs your permission to use
  Bash" or "Claude is waiting for your input") and the project folder's path. Nothing from your conversation goes in.

## What it stores, and where

On your computer:

- `~/.claude/needs-you/config.json`: your Slack user id, first name, which alerts you picked, and whether it's on.
- One hook entry in `~/.claude/settings.json` with your Slack user id in it, only after you say yes, plus a backup
  of the file from before the change (`settings.json.bak-needs-you`).

## Who it's shared with

- Slack, through your claude.ai Slack connector: a message to your own DM with the notification text and the project
  folder's path, each time Claude Code fires a permission or waiting alert you picked. Slack keeps it under your
  workspace's terms.
- Anthropic, through Claude Code: your Slack profile details become part of the conversation during setup, under your
  Claude account's terms and Anthropic's privacy policy.
- Nobody else.

## How long it's kept

Until you delete it. `/needs-you remove` takes the hook out of your settings and deletes `~/.claude/needs-you/`.
Messages in Slack stay until you delete them there.

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
