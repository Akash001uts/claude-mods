---
name: apply
description: The /apply command for the user's job and internship applications (application-assistant). With no arguments it gives the rundown - whether today's role scan ran, new roles in the last digest, OA, interview and closing dates and follow-ups due in the next week, and the weekly review if it's that day. With arguments it routes - /apply check, /apply <link>, /apply ready <role>, /apply fill <role>, /apply review, /apply setup, /apply help. Use when the user runs /apply, or asks "what's due on my applications", "any application reminders", "application rundown", "what's on for my applications this week", "anything due for my internships".
argument-hint: "[check | <link> | ready <role> | fill <role> | review | setup | help]"
---

# /apply

What the user typed after `/apply` (empty means no arguments): "$ARGUMENTS"

Data lives in `~/.claude/application-assistant/` (use `$CLAUDE_CONFIG_DIR/application-assistant/` instead if that
environment variable is set): `profile.md`, `config.json`, `reminders.json`, and `digests/`. Read them with your
normal tools. Never create or change them from this skill except where a step below says so.

## Route

Take the first word of the arguments (case doesn't matter) and the rest:

| First word | Do |
|---|---|
| (nothing) | The **rundown** below. |
| `help` | Show the help block below, nothing else. |
| starts with `http://` or `https://` | Load `application-assistant-lite:role` with the Skill tool, passing the link. |
| `check` | Load `application-assistant-lite:check`, passing the rest (`roles` or `inbox`, or nothing). |
| `ready` | Load `application-assistant-lite:ready`, passing the rest as the role. |
| `fill` | Load `application-assistant-lite:fill`, passing the rest as the role. |
| `review` | Load `application-assistant-lite:review`. |
| `setup` | Load `application-assistant-lite:setup`, passing the rest (what to change, if anything). |
| anything else | Say `Unknown: /apply <word>` and show the help block. |

Before routing anything except `setup` and `help`: if `config.json` doesn't exist, say
`application-assistant isn't set up yet: /apply setup.` (with the help block underneath when there were no arguments)
and stop. If `ready` or `fill` has no role after it, say `Usage: /apply ready <role>` (or `fill`) and stop.

When you load a skill, call the Skill tool with its full name (for example `application-assistant-lite:check`) and the
remaining words as its arguments, then follow what it says. Don't do the work from memory of what the skill says.

Help block (show it exactly):

```
/apply                 rundown: scan status, new roles, what's due, follow-ups
/apply check           scan for roles, sweep your inbox, update the tracker
/apply <link>          check a role and build its application pack
/apply ready <role>    the 7-point pre-submit check
/apply fill <role>     fill the form in Chrome (you review and submit)
/apply review          weekly review now
/apply setup           set up or edit your profile
```

## The rundown

1. Read `config.json` and `reminders.json` (a missing or broken `reminders.json` counts as no reminders).
2. Get the real local date, time and weekday with a shell command (PowerShell: `Get-Date -Format "yyyy-MM-dd HH:mm dddd"`,
   bash: `date "+%Y-%m-%d %H:%M %A"`). Don't guess them.
3. **Did today's scan run?** Work it out like this, with `scanTime` defaulting to `08:00`:
   - `lastScanOk` is `false`: **failed**. Say `The last scan failed: <lastScanError>.`
   - No `lastScan`: **missed** if the time now is past `scanTime`, otherwise **not due yet**.
   - `lastScan` (an ISO time, convert it to a local date) is today: **ran today**.
   - Otherwise: **missed** if the time now is past `scanTime` or `lastScan` is more than a day old, otherwise
     **not due yet**.
   Always say which one it is in one line. Never hide a failed or missed scan.
4. **New roles.** If `newRoles` is set: `<newRoles> new role(s) in the last digest (<lastDigest>).`
5. **Due in the next week.** From `reminders.json`, skip entries with `"done": true`, keep those whose `due` is today,
   overdue, or within 7 days, soonest first. One line each: `<what>: <when>`, where `<when>` is `3d overdue`, `today`,
   `tomorrow` or `in 4d`. Start follow-up lines (`"kind": "followup"`) with `↩` and the rest with `•`. Mark anything
   due today, tomorrow or overdue as urgent (bold it). Show all of them. For each follow-up, offer to draft a short,
   polite email to the recruiter for the user to copy and send (in their voice with the voice-profile mod if it's
   installed). Never send it.
6. **Weekly review.** If `weeklyReview` matches today's weekday and `lastReview` isn't today:
   `It's <day>: /apply review for the weekly review.`
7. If none of 4 to 6 had anything: `Nothing new and nothing due.` Then the help block.
8. **Catch-up scan.** If the scan was **missed**, say `Today's scan hasn't run (the scheduled routine missed it).
   Scanning now.` and load `application-assistant-lite:check` with the Skill tool (roles first, then the inbox sweep). If it
   **failed**, ask whether to run `/apply check` again now.

Keep the rundown short: a heading line `application-assistant`, then the lines above. No extra commentary.
