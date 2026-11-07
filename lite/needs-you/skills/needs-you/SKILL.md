---
name: needs-you
description: Set up, check, test, turn off or remove needs-you's Slack alerts (a Slack DM when Claude is stuck on a permission prompt or has finished and is waiting for the user). /needs-you, /needs-you setup, status, test, off, on, remove. Use when the user asks to "ping me on Slack when you need me", "tell me when you're stuck on a permission", "set up needs-you", or to stop those pings.
argument-hint: "[setup | status | test | off | on | remove]"
disable-model-invocation: true
---

# /needs-you

The user typed `/needs-you $ARGUMENTS`. needs-you (lite) has no code. Its alerts come from one hook that you write into
the user's own Claude Code settings, which Claude Code runs by itself:

- A `Notification` hook of `"type": "mcp_tool"` that calls the claude.ai Slack connector's `slack_send_message` tool.
- Claude Code fires `permission_prompt` when a permission prompt has waited about 6 seconds, and `idle_prompt` when
  Claude has finished and the user hasn't typed for about 60 seconds.
- The hook sends a DM to the user's own Slack, so it works while Claude is stuck on a prompt and can't do anything.

It goes in the user's settings, not in this plugin, because the DM needs the user's own Slack user id, and a plugin's
hook can't be filled in per user.

## Files

- Settings: `~/.claude/settings.json` (on Windows `%USERPROFILE%\.claude\settings.json`). Only ever touch the needs-you
  entry described below. Never change, reorder or reformat anything else in the file.
- Config: `~/.claude/needs-you/config.json`, shaped
  `{"slackUserId": "U...", "firstName": "...", "events": "permission_prompt|idle_prompt", "on": true}`.

## The hook entry

The needs-you entry is the one object inside `hooks.Notification` whose hook has `"server": "claude.ai Slack"` and a
`message` starting with `needs-you:`. Its exact shape, with `<ID>` the user's Slack user id and `<EVENTS>` the
matcher from config:

```json
{
  "matcher": "<EVENTS>",
  "hooks": [
    {
      "type": "mcp_tool",
      "server": "claude.ai Slack",
      "tool": "slack_send_message",
      "input": {
        "channel_id": "<ID>",
        "message": "needs-you: ${message} (in ${cwd})"
      },
      "timeout": 30
    }
  ]
}
```

`${message}` and `${cwd}` are filled in by Claude Code when the hook runs (for example "Claude needs your permission to
use Bash" and the project folder). Write them literally, exactly as shown. Never put anything else from the
conversation in the message.

When writing it: read the settings file, back it up to `~/.claude/settings.json.bak-needs-you` first, then add the
entry to `hooks.Notification` (creating `hooks` or `Notification` if missing), or replace the existing needs-you entry
if there is one. Show the user the exact entry and ask before writing. Write only on a yes. Check the file is still
valid JSON afterwards; if not, restore the backup and say so.

## What to do with the arguments

Trim the arguments and work out the case:

1. **Empty**: if the config file doesn't exist, do **setup**. Otherwise do **status**.

2. **`setup`**:
   1. Check the claude.ai Slack connector is connected: its tools (like `slack_read_user_profile`) are available to
      you. If they aren't, say: "Slack isn't connected. Run /mcp, pick claude.ai Slack and sign in, then run
      /needs-you setup again." Then mention the no-Slack option: Remote Control's push notifications (in `/config`,
      turn on "Push when actions required") cover permission prompts and questions on the Claude app. Stop.
   2. Call `slack_read_user_profile` with no user given, to get the user's own Slack user id and first name. If it
      doesn't return an id, say so and stop.
   3. Ask which alerts they want, with these options: "Permission prompts and finished turns (Recommended)"
      (`permission_prompt|idle_prompt`), "Permission prompts only" (`permission_prompt`), "Finished turns only"
      (`idle_prompt`).
   4. Tell them plainly, before writing:
      - The ping comes about 6 seconds after a permission prompt shows, and about 60 seconds after Claude finishes,
        even if they're at the laptop. That's Claude Code's timing; needs-you can't wait longer or check whether
        they're there. `/needs-you off` before a long session at the desk stops it.
      - The DM is sent from their own Slack account to their own DM, so Slack might not buzz their phone for it. If
        it doesn't, they can check the DM, or use Remote Control's push in `/config` as well.
      - Changes to hooks in settings can need a new session (or a look at `/hooks`) before they apply.
   5. Show the exact hook entry with their id and matcher filled in, and ask to write it to their settings. On yes,
      write it as above. Then write the config file with `on: true`.
   6. Offer `/needs-you test`.

3. **`status`**: read the config and settings (don't edit). Say whether the hook is in settings, which alerts it
   covers, the Slack first name it DMs, and whether Slack is connected now. If the config says on but the entry is
   missing (or the other way round), say so and offer `/needs-you on` or `/needs-you off`.

4. **`test`**: needs the config. Call `slack_send_message` yourself with `channel_id` the config's `slackUserId` and
   message `needs-you: test from Claude Code. If you can see this, the Slack side works.` Say whether it worked. This
   tests the connector, not the hook; to test the hook, they can start a new session and leave a permission prompt
   up for 10 seconds.

5. **`off`**: show that you'll remove the needs-you entry from `hooks.Notification` (and `Notification` or `hooks` if
   that leaves them empty), ask, back up, remove it on yes, and set `on: false` in config. Keep the config so `on`
   can put it back.

6. **`on`**: needs the config. Re-add the entry from the config (same steps as writing it), and set `on: true`.

7. **`remove`**: like `off`, then delete `~/.claude/needs-you/` after asking. Say the plugin can be uninstalled with
   `/plugin uninstall needs-you-lite`, and that uninstalling alone does not remove the hook from settings, which is
   why `remove` exists.

8. **Anything else**: show the usage line:
   `/needs-you [setup | status | test | off | on | remove]`.

## Rules

- Never write the settings file without showing the change and getting a yes in this conversation.
- Never add any other hook, permission rule or setting.
- Never send anything to Slack except the test message, and only on `/needs-you test`.
- needs-you never reads Slack replies and never answers prompts or approves anything. If the user asks to reply from
  Slack, say this version only sends alerts; they answer on the machine (or on the Claude app with Remote Control).
