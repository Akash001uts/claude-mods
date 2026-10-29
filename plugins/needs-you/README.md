# needs-you

I kept leaving Claude working, walking off, and coming back an hour later to find it had been sitting on a permission
prompt for 55 minutes. This mod messages you on Slack when Claude has been waiting on you for a while, with what it's
waiting on, and you can reply right there in Slack to keep the session going.

## Install

```
/plugin install needs-you --marketplace Akash001uts/claude-mods
```

It uses the claude.ai Slack connector: connect Slack once at claude.ai > Settings > Connectors and it works in every
session. No bot, no tokens of your own.

## How it works

- **First run** asks what to ping you about: finished turns, permission prompts, questions, and the permission
  counter (tick any or all). Then it checks Slack is connected, and if it is, gives you the allow rule to add so a
  ping never raises its own permission prompt. It never writes your settings itself.
- **When it pings.** After Claude has waited on you for **5 minutes** (`/needs-you wait <minutes>` changes it). That
  wait is the "are you at the laptop" check: answer on the laptop within 5 minutes and nothing is sent. Mods can't
  see whether the terminal has focus or the keyboard is idle, so there's no better check than that.
- **One DM with you for everything.** Each ping is one message in your Slack DM, naming the session so pings from
  different sessions don't get mixed up:
  - "Hey Sam, help-drafting-email has returned a reply:" then Claude's reply, then "Return to your machine to
    continue, or reply here with your follow-up."
  - "Hey Sam, help-drafting-email is asking permission to run `npm test`. Reply yes or no."
  - "Hey Sam, help-drafting-email has a question for you:" then the question and numbered options.
  The name comes from your Slack profile; the session is the project folder's name. Replies over 3,000 characters
  are cut with "full reply on your machine". The DM has Claude's actual reply in it, so it can contain code or file
  contents, and it stays in Slack's history.
- **Replying from Slack.** While a ping is waiting, the mod checks the DM every 10 seconds.
  - A reply in a ping's thread goes to that ping's session. A plain message in the DM goes to the most recent session
    still waiting, and the mod replies "→ <session>" so you know where it went.
  - Finished turn: your reply goes in as your next message.
  - Permission: "yes" or "no" (anything else gets "Reply yes or no"). Claude Code's own permission box can't be
    answered by a mod, so the mod stops the turn (which closes the box) and tells Claude what you said; on a yes, that
    exact call is allowed once when Claude runs it again.
  - Question: a number or an option's name picks it; anything else goes in as your own answer. The turn is stopped
    the same way and Claude gets your answer.
  - Only messages from your own Slack user in that DM count. Anything else is ignored, because a reply runs on your
    machine with your permissions.
- **First answer wins.** Answer on the laptop and the ping is closed; a Slack reply after that gets "Already
  answered on your machine" and isn't used.
- **Without Slack**, pings go to Claude Code's own push notification instead (the Claude app on your phone, with
  Remote Control on). That's one way only.
- **Permission counter.** Counts the permission prompts you approve, per command (`Bash(npm test)`). After 3
  approvals of the same one, it shows the exact allow rule to add, once. It never adds rules itself.

## Commands

- `/needs-you` shows what's on and whether Slack is connected.
- `/needs-you turns|permissions|questions|counter on|off`, `/needs-you wait <minutes>`.
- `/needs-you test` sends a test message to your Slack DM. `/needs-you setup` asks the first-run question again.

## What it runs and stores

- **What it reads.** Claude's replies, questions and permission prompts (to ping you about them), your replies in
  your Slack DM (only from your own Slack user), your Slack profile (your user id and first name), which commands you
  approve (for the counter), and the list of connected tools (to find the Slack connector).
- **What it sends.** The ping's text (your first name, the session's folder name, what Claude is waiting on, and
  Claude's reply or question) to your own Slack DM through the claude.ai Slack connector, only after the wait. Without
  Slack, a short push through Claude Code's PushNotification tool.
- **What it puts into the session.** Your Slack replies: as your next message after a finished turn, or as a note to
  Claude ("needs-you: The user approved `npm test` from Slack...") after a permission prompt or question, together
  with stopping the turn that was waiting.
- **What it allows.** Only the one call you said yes to from Slack, once, when Claude runs it again.
- **What it stores.** Your settings, your Slack user id, first name and DM channel, the waiting pings (so several
  sessions share one DM), the Slack messages it already handled, and the approval counts, in Claude Code's plugin
  storage.
- It never writes files, runs commands or changes settings.

[Privacy](PRIVACY.md): what it reads and stores, where, who it's shared with and how to delete it.

## What each hook does

The mod is `hooks/register.tsx`, with the Slack reading and the DM wording in `hooks/slack.ts`. It hooks these
events and nothing else:

- `session.start`: registers `/needs-you`, starts the 10-second timer that sends pings that are due and checks the DM
  for replies, and asks the first-run question once.
- `turn.start`: notes the main turn's id (to stop it on a Slack answer) and closes a finished-turn ping, since a new
  turn has begun.
- `turn.complete`: starts the wait after a finished turn. The answer shown is not changed.
- `prompt.submit`: closes a finished-turn ping when you type on the machine. Your prompt is not changed.
- `tool.check`: when Claude Code is about to ask you for permission, starts the wait and notes the call for the
  counter. It returns Claude Code's own verdict, except for the one call you allowed from Slack, which it allows once.
- `tool.call`: starts the wait for a question (AskUserQuestion), and closes any wait when its call ends. For the
  counter, notes an approved call. It never changes the call or its result.
- `session.end`: closes this session's pings.
- `command.run` (`/needs-you` only): answers the command.
