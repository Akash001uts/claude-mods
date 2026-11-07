# needs-you (lite)

This is the code-free version of my needs-you mod. It's one skill (a Markdown file), no hooks module, so it fits the
plugin directory's rules. It only does alerts: it can't read your replies from Slack like the code version.

## What it does

I kept leaving Claude working, walking off, and coming back an hour later to find it had been sitting on a permission
prompt for 55 minutes. This sends you a Slack DM when Claude is stuck on a permission prompt or has finished and is
waiting for you, so you know to go back.

It works through one hook in your own Claude Code settings. Claude Code runs it by itself (Claude doesn't have to do
anything, which matters because it can't while a permission prompt is up). The hook calls your claude.ai Slack
connector to DM you. `/needs-you` sets it up, after showing you the exact change and asking.

## Install

```
/plugin install needs-you-lite --marketplace Akash001uts/claude-mods
```

Connect Slack once at claude.ai > Settings > Connectors (or `/mcp` > claude.ai Slack), then run `/needs-you`.

Install this or the code version (`needs-you`), not both.

## How to use it

| Command | What it does |
|---|---|
| `/needs-you` or `/needs-you setup` | Gets your Slack user id, asks which alerts you want, shows the hook and adds it to your settings on yes |
| `/needs-you status` | Says what's on and whether Slack is connected |
| `/needs-you test` | Sends one test DM, to check the Slack side works |
| `/needs-you off` / `on` | Takes the hook out of your settings, or puts it back |
| `/needs-you remove` | Takes the hook out and deletes its config (do this before uninstalling) |

If another plugin has a `/needs-you`, use `/needs-you-lite:needs-you`.

A DM looks like: `needs-you: Claude needs your permission to use Bash (in C:\claude_stuff\projects\Claude_Mods)`.

## What's different from the code version

- **Permission prompt pings:** kept, but they come about 6 seconds after the prompt shows (that's when Claude Code
  fires its notification), not after 5 minutes. The DM says which tool, not the exact command.
- **Finished turn pings:** kept, about 60 seconds after Claude finishes if you haven't typed. The DM doesn't include
  Claude's reply, just that it's waiting.
- **The 5-minute "are you at the laptop" wait:** gone. Nothing can wait or check, so it pings even when you're at
  the desk. Use `/needs-you off` for a long session at the desk.
- **Question pings:** not separate any more. A question that sits there may show up as a waiting alert, but I
  haven't checked that.
- **Replying from Slack (your next message, "no" to stop a command, picking an option):** gone. This version only
  sends. Answer on your machine, or on the Claude app with Remote Control.
- **Several sessions in one DM, "→ session" routing:** gone (nothing to route). Each DM names the project folder.
- **"Hey Akash" and Claude's reply in the DM:** gone. The DM only has Claude Code's own notification text and the folder.
- **Push notifications without Slack:** changed. Remote Control does this itself now: in `/config` turn on "Push when
  actions required" (permission prompts and questions). Setup points you to it if Slack isn't connected.
- **Permission counter and allow-rule suggestions:** gone. Claude Code's built-in `/fewer-permission-prompts` does
  nearly the same job.
- **First-run question at session start:** changed to `/needs-you setup`, since nothing code-free runs at session
  start.

One thing I haven't been able to check yet: the DM goes from your own Slack account to your own DM, so Slack might not
buzz your phone for it. `/needs-you test` shows whether the message arrives; whether it notifies you depends on your
Slack settings.

## What it runs and stores

- **Files it writes, through Claude's normal tools** (so you get the usual permission prompts):
  - `~/.claude/needs-you/config.json`: your Slack user id, first name, which alerts you picked, and on or off.
  - One entry under `hooks.Notification` in `~/.claude/settings.json`, only after you see it and say yes. It backs
    the file up to `settings.json.bak-needs-you` first and never touches anything else in it.
- **The hook:** `"type": "mcp_tool"`, calling the claude.ai Slack connector's `slack_send_message` with your user id
  and `needs-you: ${message} (in ${cwd})`. Claude Code fills those in with its own notification text and the project
  folder. It runs no commands or scripts.
- **What leaves the machine:** that DM to your own Slack, each time an alert you picked fires, and during setup your
  Slack profile (user id and first name) read through the connector. `/needs-you test` sends one test DM. Nothing else.
- Uninstalling the plugin doesn't take the hook out of your settings (it's yours, not the plugin's), so run
  `/needs-you remove` first.

[Privacy](PRIVACY.md): what it reads and stores, where, who it's shared with and how to delete it.

## Licence

MIT
