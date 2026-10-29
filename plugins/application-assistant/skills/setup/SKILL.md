---
name: setup
description: Set up or edit the user's job-application profile for application-assistant - resumes, work rights, dates, locations, role types, target companies, never-claim list, tracker, inboxes, daily scan and weekly review - by interview. Use when the application-assistant plugin asks for setup, the user runs /apply setup, or says "set up my job applications", "change my target companies", "add a resume".
argument-hint: "[what to change]"
---

# Application profile setup

Build (or edit) the profile every other application-assistant skill works from, by asking the user, a few questions
at a time with the AskUserQuestion tool where there are clear options and in plain chat where answers are free text.
Nothing personal is assumed: every field comes from the user's own answers or their own resumes.

Files, all in `~/.claude/application-assistant/` (use `CLAUDE_CONFIG_DIR` instead of `~/.claude` if it's set):

- `profile.md`: the profile, in the sections below. The user's to read and edit.
- `config.json`: what the mod's hooks read (shape below). Write valid JSON only.
- `reminders.json`: `[]` to start; other skills add to it.
- `digests/`: the scan's daily digests and `seen.json`.

If `profile.md` exists, this is an edit: show the current section the user wants to change, change only that, and
keep everything else as it is.

## 1. The interview

Ask in this order. Say why each one matters in a few words, and that they can skip anything.

1. **Resumes.** Ask where their resume files are. Read each one. For each, ask what role type it's for (e.g.
   software, data, quant, finance). Word (`.docx`) is the default format; ask if they also keep any in Google Docs and
   record the link. These are the **base resumes**: never edited by any skill.
2. **Work rights**, per country they'd work in: citizen, permanent resident, or visa type, with any hour limits during
   study terms and breaks. Ask about sponsorship needs.
3. **Dates.** Expected graduation date (month and year), study term dates, and when they can work full time.
4. **Where.** Countries and cities, in priority order.
5. **What.** Role types (internship, graduate, part time; software, data, and so on). Then offer a second, optional
   track: "roles your experience already fits" (e.g. support, tutoring, retail tech), suggested from their resumes'
   work history. They pick which, if any.
6. **Who.** Target companies, and a skip list (companies to avoid, and any employer's limit on applications, e.g.
   "Company X: max 2 applications a year").
7. **Never-claim list.** Read the resumes and suggest things a tailored resume or cover letter must never say because
   the bases don't (skills not listed, titles not held, numbers not stated). The user edits the list.
8. **Applications folder.** Where packs and the tracker live (suggest `~/Applications`). Packs go in
   `<folder>/Applications/NN_Company_Role/`.
9. **Tracker.** Which format: Excel, Google Sheets, Notion or CSV, and where. If they already have one, use it as it
   is: read its columns and map them. Otherwise create one with these columns: Company (with link), Role, Location,
   Date opened, Closes, Applied date, Stage, Status, Status date, Resume version sent, Source / referral, Notes.
   Statuses: Open - apply, Applied, In progress, Rejected, Ineligible, No response, Offer, Check, Opens later. For
   Excel, use the xlsx skill if available; never rebuild an existing tracker.
10. **Inboxes.** Gmail, Outlook (Microsoft 365 connector) or both. Check the chosen connector is connected; if not,
    say how to connect it (claude.ai > Settings > Connectors).
11. **Daily scan time** (e.g. 08:00). Then ask: "Create a scheduled cloud routine that scans for roles every day at
    that time?" With a yes, use the `schedule` skill to create one. Its prompt: scan the target companies' job boards
    (Greenhouse, Lever, Ashby, Workday and public career APIs), the country job sites with open APIs and a web search
    for the role types and places in the profile (paste the relevant profile sections into the routine prompt, since
    the routine can't read local files), and email the user a digest with the subject
    `application-assistant digest YYYY-MM-DD` through their connected inbox. If they decline, or no inbox connector
    works in the routine, say the scan will run when they open a session in the applications folder instead.
12. **Weekly review**: on or off, and which day.

## 2. Write the files

`profile.md` sections, in this order, with the user's answers (and "not set" for anything skipped):
`Resumes` (path, format, role type each), `Work rights`, `Dates`, `Where`, `What` (and the second track), `Target
companies`, `Skip list`, `Never claim`, `Applications folder`, `Tracker`, `Inboxes`, `Scan`, `Weekly review`.

`config.json`:

```json
{
  "applicationsDir": "<absolute path of the applications folder>",
  "scanTime": "08:00",
  "weeklyReview": "sunday"
}
```

Leave out `weeklyReview` when it's off. Keep any other fields already there (the scan and review skills keep them
up to date).

## 3. Finish

Say what was set up in a few lines: the profile path, the tracker, whether the routine was created, and that the
rundown and reminders show when they open a session in the applications folder. Then: `/apply <link>` checks a role
and builds its pack; `/apply check` scans and sweeps the inbox.
