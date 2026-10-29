# application-assistant

Applying for internships by hand means the same loop every day: find new roles, check whether I'm even eligible
(work rights, grad date, dates), pick or tailor a resume, write a cover letter, fill the same form fields again, log
it in a tracker, then watch my inbox for assessments and rejections. This mod does that loop with you. You set up a
profile once, and from then on it finds roles, checks them against your situation, builds an application pack for
each one, fills the form in Chrome for you to review, and keeps your tracker and reminders up to date. It never
submits anything: you do.

Nothing about me ships with it. Every personal field (work rights, dates, target companies, resumes) is a blank you
fill in at setup, and it lives on your machine.

## Install

```
/plugin install application-assistant --marketplace Akash001uts/claude-mods
```

## How it works

- **Setup** (`/apply setup`, or offered once at the start of your first session) is a short interview: your resumes
  (Claude reads them and asks what role type each is for), work rights per country, graduation and term dates, where
  you'd work in priority order, role types (plus an optional "roles my experience already fits" track), target
  companies and a skip list, a never-claim list suggested from your resumes, your applications folder, your tracker
  (Excel, Google Sheets, Notion or CSV; an existing one is used as it is), your inbox (Gmail, Outlook or both), a
  daily scan time and a weekly review day. It's saved in `~/.claude/application-assistant/profile.md`, which you can
  read and edit.
- **Finding roles.** At setup you can create a Claude Code scheduled cloud routine that scans every day at your time:
  your target companies' job boards (Greenhouse, Lever, Ashby, Workday, public career APIs), country job sites with
  open APIs, and a web search, then emails you a digest. If the routine didn't run, the scan runs when you open a
  session in your applications folder. Either way, a session there starts with a rundown: new roles, what's due, and
  a warning if a scan failed or was missed.
- **Checking a role** (`/apply <link>`): still open on the employer's own site, work rights for that location, your
  grad window (only from what the posting says, never guessed from "penultimate year"), dates and hours, paid, not a
  duplicate, under the employer's cap. Each role is Eligible, Ineligible (with the reason) or Check (with the exact
  quote that's unclear).
- **The pack**, for an eligible role: you choose your existing resume for that role type or a tailored copy (it
  reorders and rewords, and only claims what your base resume already says), a cover letter if the form has an upload
  field for one (in your voice if the voice-profile mod is installed), and an `Application_Brief.md` with the facts,
  the files and your form answers. Every file is checked against your never-claim list.
- **Before you submit** (`/apply ready <role>`): a 7-point check (still open, grad window, work rights, dates and
  hours, pay, two real matches with no invented numbers, not a duplicate and under the cap).
- **Forms** (`/apply fill <role>`): Claude fills the form in your Chrome (Claude in Chrome) from the brief and stops
  before submit. Claude's own safety rules apply: it asks before entering personal details, never types passwords or
  ID numbers, and never submits.
- **Tracker.** Edited in place, never rebuilt, so your own edits survive. Columns include the resume version sent and
  the source or referral.
- **Hearing back** (`/apply check`): sweeps your inbox for applicant-system senders and phrases ("thank you for
  applying", "assessment", "interview", "unfortunately") and updates each role's stage and status.
- **Reminders.** In your applications folder, a band above the prompt shows OA and interview due dates, closing
  dates and follow-ups due in the next week. After 14 days with no response, it offers to draft a short follow-up
  email to the recruiter for you to copy and send. It never sends anything.
- **Weekly review** (`/apply review`, or a nudge on your chosen day): what you sent, responses, what's due, what to
  drop.

## Commands

`/apply` (rundown), `/apply check`, `/apply <link>`, `/apply ready <role>`, `/apply fill <role>`, `/apply review`,
`/apply setup`. The work is done by the mod's skills (`application-assistant:setup`, `check`, `role`, `ready`,
`fill`, `review`), which you can also ask for in plain words.

## What it runs and stores

- **What the hooks read.** Only `~/.claude/application-assistant/config.json` and `reminders.json` (written by the
  skills), and the `USERPROFILE`/`HOME` and `CLAUDE_CONFIG_DIR` environment variables to find them.
- **What Claude reads and writes, through the skills, when you ask.** Your resumes, profile and tracker; job postings;
  your inbox (only through your own connector, only application emails). It writes packs in your applications folder,
  your tracker, the digest and seen list, and the profile.
- **What it sends.** Postings and resume text go to Claude (it's doing the checking and tailoring). Nothing goes to
  employers, ever: form filling happens in your own browser, and you submit.
- **What it creates.** One scheduled cloud routine, at setup, only if you say yes.
- **What it submits as a prompt.** Fixed text naming one of its skills: after you say yes to setup, after an `/apply`
  command, or at session start in your applications folder when the day's scan didn't run. Each one is written out in
  `hooks/register.tsx` (`NUDGE`), with only your `/apply` arguments added.
- **What it asks.** Whether to set up, once.
- **What it stores.** That it already offered setup, in Claude Code's plugin storage.

## What each hook does

The mod is `hooks/register.tsx` plus six skills. It hooks these events and nothing else:

- `session.start`: registers `/apply`; offers setup once if there's no profile; in your applications folder, shows
  the rundown and starts the scan if the scheduled one didn't run.
- `command.run` (`/apply` only): shows the rundown, or starts the matching skill.
- `ui.render` (above the prompt, only in your applications folder): draws reminders due in the next week above
  whatever else draws there.
