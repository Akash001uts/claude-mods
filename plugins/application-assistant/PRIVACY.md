# Privacy: application-assistant

Last updated 30 October 2026.

application-assistant runs on your own computer inside Claude Code. I don't run a server for it, and it doesn't collect
anything or send anything to me.

## What it reads

- Your profile, which you build at setup: your name and contact details, work rights, study and grad dates, the places
  and role types you want, target companies, and facts you don't want claimed.
- Your resumes, cover letters and application tracker.
- Job postings, from company job boards, job sites with open APIs and web searches.
- Your inbox, only through the Gmail or Outlook connector you pick, and only to find application emails and the daily
  digest.

## What it stores, and where

- In your applications folder, on your computer: the application packs (resume copies, cover letters,
  `Application_Brief.md`), your tracker, the daily digests and the list of roles already seen.
- In `~/.claude/application-assistant/`: your profile (`config.json`) and reminders.
- In Claude Code's plugin storage: whether it has already offered setup.

## Who it's shared with

- Anthropic, through Claude Code: what Claude reads to check roles and write packs, the same as any other file you
  open with Claude, under your Claude account's terms and Anthropic's privacy policy.
- Anthropic's cloud, if you say yes to the daily scan: the scheduled routine's prompt holds the parts of your profile
  the scan needs (role types, places, target companies, dates), because the routine can't read your files.
- Job boards and search: the scan sends searches (company names, role types and places), never your name or resume.
- Your email provider, through your own connector: the routine emails you a daily digest, and the check reads
  application emails.
- Employers, only when you ask it to fill a form: Claude types your details into the employer's application page in
  your own Chrome. It asks before entering personal details, never types passwords or ID numbers, and never submits.
  Nothing reaches the employer until you submit.
- Nobody else.

## How long it's kept

Until you delete it. Delete your applications folder and `~/.claude/application-assistant/`, delete the scheduled
routine (`/schedule`) if you made one, and uninstall the plugin to clear its plugin storage.

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
