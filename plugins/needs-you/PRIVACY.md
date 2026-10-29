# Privacy: needs-you

Last updated 30 October 2026.

needs-you runs on your own computer inside Claude Code. I don't run a server for it, and it doesn't collect anything or
send anything to me.

## What it reads

- What Claude is waiting on you for: its reply, its question, or the command in a permission prompt.
- Through your own claude.ai Slack connector: your Slack profile (your user id and first name) and the replies in your
  Slack DM. It only acts on messages from your own Slack user in that one DM.
- Which commands you approve, to count them for allow-rule suggestions.

## What it stores, and where

In Claude Code's plugin storage on your computer: your settings, your Slack user id, first name and DM channel, the
pings still waiting, the Slack messages it has already handled, and the approval counts.

## Who it's shared with

- Slack, through your claude.ai Slack connector: after you've been away for the wait time (5 minutes by default), a
  message to your own DM with your first name, the session's name, what Claude is waiting on, and Claude's reply or
  question (cut to a few thousand characters). Slack keeps it under your workspace's terms.
- Without Slack, a short push through Claude Code's PushNotification tool to your Claude app.
- Nobody else.

## How long it's kept

The plugin storage keeps it until you uninstall the plugin (which clears it). Messages in Slack stay until you delete
them there.

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
