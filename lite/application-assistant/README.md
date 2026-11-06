# application-assistant (lite)

This is the code-free version of my application-assistant mod. The plugin directory now only takes plugins made of
Markdown, JSON and images unless you're a Verified organisation, so I rebuilt it with just skills. It's here so I can
use it for a while and see if it's good enough without the code.

## What it does

Applying for internships by hand is the same loop every day: find new roles, check whether I'm even eligible (work
rights, grad date, dates), pick or tailor a resume, write a cover letter, fill the same form fields again, log it in a
tracker, then watch my inbox for assessments and rejections. This does that loop with you. You set up a profile once,
and from then on it finds roles, checks them against your situation, builds an application pack for each one, fills
the form in Chrome for you to review, and keeps your tracker and reminders up to date. It never submits anything: you
do.

Nothing about me ships with it. Every personal field (work rights, dates, target companies, resumes) is a blank you
fill in at setup, and it lives on your machine.

## Install

```
/plugin install application-assistant-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`application-assistant`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

If you already used the code version, your profile, `config.json`, `reminders.json` and digests in
`~/.claude/application-assistant/` keep working as they are. Nothing needs migrating.

## How to use it

Everything goes through `/apply`:

| Command | What happens |
|---|---|
| `/apply` | The rundown: whether today's scan ran (or failed, and why), new roles in the last digest, OA, interview and closing dates and follow-ups due in the next week, and a weekly review reminder on your review day. If the scan was missed it runs it straight away. |
| `/apply check` | Scan for roles and sweep your inbox for replies, update the tracker and reminders, show a table of what changed. `/apply check roles` or `/apply check inbox` does just one half. |
| `/apply <link>` | Check one posting (still open on the employer's site, work rights, grad window, dates and hours, pay, duplicates, employer caps) and build its pack if it fits. |
| `/apply ready <role>` | The 7-point pre-submit check. Tell it "I've submitted it" after and it saves the files and receipt and marks the tracker. |
| `/apply fill <role>` | Fill the form in your Chrome (Claude in Chrome) and stop before submit. |
| `/apply review` | Weekly review now. |
| `/apply setup` | Set up or edit your profile. |
| `/apply help` | The command list. |

If another plugin also has a skill called `apply`, use `/application-assistant-lite:apply` instead. The other skills can be
typed directly too, but some short names clash with other plugins or built-in commands (`/setup` and `/ready` are
also in my assessment-marker mod, and `/review` may clash with a built-in), so the safe forms are `/application-assistant-lite:setup`,
`/application-assistant-lite:check`, `/application-assistant-lite:role`, `/application-assistant-lite:ready`,
`/application-assistant-lite:fill` and `/application-assistant-lite:review`. Mostly I just use `/apply`.

You can also just ask in plain words, and Claude picks the right skill:

- "what's due on my applications", "any application reminders", "application rundown" (the rundown)
- "any new roles", "check my applications", "did anyone reply" (scan and inbox sweep)
- paste a posting and ask "should I apply" or "build the pack for this" (role check and pack)
- "am I ready to apply", "check before I submit", "I've submitted it" (pre-submit check)
- "fill in the application", "do the form for me" (form fill)
- "how are my applications going", "weekly review" (weekly review)
- "set up my job applications", "change my target companies", "add a resume" (setup)

**Setup** is a short interview: your resumes (Claude reads them and asks what role type each is for), work rights per
country, graduation and term dates, where you'd work in priority order, role types (plus an optional "roles my
experience already fits" track), target companies and a skip list, a never-claim list suggested from your resumes,
your applications folder, your tracker (Excel, Google Sheets, Notion or CSV; an existing one is used as it is), your
inbox (Gmail, Outlook or both), a daily scan time and a weekly review day. It can also create the daily scheduled
cloud routine (through `/schedule`) that scans and emails you a digest, and it offers to add a small marked block to
your `~/.claude/CLAUDE.md` so you get the rundown at the start of a session in your applications folder (more on that
below).

## What's different from the code version

| Feature | Lite version |
|---|---|
| `/apply` command and its subcommands (`check`, `<link>`, `ready`, `fill`, `review`, `setup`, `help`) | Kept. `/apply` is now a skill that routes on what you type. Same subcommands and usage messages. |
| The six skills (setup, check, role, ready, fill, review) | Kept, same steps. Only references to the hooks were taken out. |
| Rundown on `/apply` | Kept, and now it also lists every reminder due in the next week (what the band used to show) and says plainly whether today's scan ran, was missed, failed or isn't due yet. |
| One-time setup offer at the start of your first session | Gone. Nothing code-free runs at session start. `/apply` tells you to run `/apply setup` if you're not set up, and asking "set up my job applications" works too. |
| Rundown at session start in the applications folder | Changed. Setup offers an optional marked block in `~/.claude/CLAUDE.md` asking Claude to give the rundown before its first reply in that folder. So it shows after your first message, not the moment the session opens. Without the block, run `/apply`. |
| Catch-up scan if the scheduled routine didn't run | Changed. The rundown spots a missed scan and runs `/apply check` right then. It happens when you run `/apply` (or on your first message, with the block), not by itself. |
| Reminders band above the prompt | Gone, because a plugin without code can't draw anything. The same reminders (OA, interview, closing dates, follow-ups, soonest first, overdue ones included) are in the `/apply` rundown, all of them instead of the top 3. |
| Weekly review nudge on your review day | Changed. It's a line in the rundown on that day, not a message at session start. |
| Daily scheduled cloud routine | Kept. Setup still creates it with `/schedule` if you say yes. |
| Follow-up email drafts after 14 days | Kept, offered in the rundown, the check and the review. Never sent. |
| "Already offered setup" flag in plugin storage | Gone, nothing to remember. |
| Hooks | None. A prompt hook can't run at session start or add context to a prompt, so none of them earned their place. |

## What it runs and stores

- **Files it reads and writes**, all through Claude's normal Read, Write and Edit tools (so you see the usual
  permission prompts):
  - `~/.claude/application-assistant/profile.md`: your profile. Yours to read and edit.
  - `~/.claude/application-assistant/config.json`: applications folder, scan time, weekly review day, and when the
    last scan, sweep, digest and review happened.
  - `~/.claude/application-assistant/reminders.json`: due dates and follow-ups.
  - `~/.claude/application-assistant/digests/`: daily digests and `seen.json`.
  - (`$CLAUDE_CONFIG_DIR` instead of `~/.claude` if you set it.)
  - Your applications folder: the packs (`Applications/NN_Company_Role/` with resume copies, cover letters and
    `Application_Brief.md`) and your tracker, which is edited in place, never rebuilt.
  - Your resumes, read only. Base resumes are never edited.
  - `~/.claude/CLAUDE.md`, only if you say yes to the session-start block at setup. It shows you the exact text, backs
    the file up first, and only touches the lines between `<!-- application-assistant:start -->` and
    `<!-- application-assistant:end -->`. Ask it to remove the block and it deletes just those lines.
- **What it runs.** A shell command to get the real date and time for the rundown. Excel trackers go through the
  xlsx skill, Google Sheets and Notion through their connectors.
- **What leaves the machine:**
  - Postings, resume text and anything else Claude reads go to Anthropic through Claude Code, like any other file.
  - The scan sends searches (company names, role types, places) to company job boards (Greenhouse, Lever, Ashby,
    Workday, careers-site APIs), country job sites with open APIs and web search. Never your name or resume.
  - The scheduled cloud routine (only if you say yes) runs in Anthropic's cloud, and its prompt holds the parts of
    your profile the scan needs (role types, places, target companies, dates), because it can't read your files. It
    emails you the digest through your own inbox connector.
  - Your inbox is only read through your own Gmail or Outlook connector, and only for application emails and the
    digest.
  - `/apply fill` types your details into the employer's form in your own Chrome. It asks before entering personal
    details, never types passwords or ID numbers, and never submits. Nothing reaches an employer until you submit.
- **What it creates.** One scheduled cloud routine, at setup, only if you say yes.

[Privacy](PRIVACY.md): what it reads and stores, where, who it's shared with and how to delete it.

## Licence

MIT
