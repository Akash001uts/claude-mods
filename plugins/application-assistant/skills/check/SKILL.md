---
name: check
description: Scan for new job or internship roles that fit the user's application-assistant profile, sweep their inbox for application replies, update their tracker in place and their reminders, and show a short table of what changed. Use when the user runs /apply check, asks "any new roles", "check my applications", "did anyone reply", or when the application-assistant plugin says the daily scan didn't run.
argument-hint: "[roles | inbox]"
---

# Scan and inbox sweep

Read `~/.claude/application-assistant/profile.md` and `config.json` first (`CLAUDE_CONFIG_DIR` instead of
`~/.claude` if set). If they don't exist, stop and suggest `/apply setup`. With `roles` do only part 1, with `inbox`
only part 2.

## 1. New roles

1. **Digest from the routine.** Search the user's inbox for today's `application-assistant digest YYYY-MM-DD` email.
   If it's there, take its roles. If not, run the scan here:
2. **Scan.** For each target company, its own job board (Greenhouse, Lever, Ashby, Workday, or its careers site's
   public API). Then the country job sites with open APIs for the places in the profile, and a web search for the role
   types. A site that blocks scripts can be read through Claude in Chrome, only if the user asks.
3. **Dedupe** against the tracker by the posting's link (including links inside hyperlinked cells) and by company plus
   role, and against `digests/seen.json`. A role only shows up once.
4. **Quick filter** against the profile: role type, location, dates. Drop clear mismatches; keep anything unclear for
   a `role` check.
5. **Write the digest** to `digests/YYYY-MM-DD.md`, oldest-opened roles first, with company, role, location, link,
   closing date and one line on fit. Add each link to `seen.json`.
6. **Record the scan** in `config.json`: `lastScan` (ISO time), `lastScanOk` (true, or false with `lastScanError`
   saying what failed), `lastDigest` (the date) and `newRoles` (the count). Never hide a failed scan: say it.

## 2. Inbox sweep

1. Search the connected inbox (Gmail and/or Outlook, as the profile says) since the last sweep (`lastSweep` in
   `config.json`, else 14 days) for application mail: senders from applicant systems (Workday, Greenhouse, Lever,
   Ashby, SmartRecruiters, iCIMS, Oracle, HackerRank, CodeSignal, HireVue and similar) and phrases like "thank you for
   applying", "unfortunately", "assessment", "interview", "next steps", "offer".
2. Match each thread to a tracker row (company and role). For each: receipt → Applied (with the date); assessment →
   In progress, stage OA; interview → In progress, stage Interview; rejection → Rejected; offer → Offer. Set the status
   date.
3. **Reminders.** Add each OA or interview due date to `reminders.json` (`{"what": "OA: Company Role", "due":
   "YYYY-MM-DD", "kind": "oa", "role": "NN_Company_Role"}`). For a row Applied 14 or more days ago with no response,
   add a `followup` reminder once, and mark No response if it has been more than 6 weeks. Mark reminders that are
   past or answered `"done": true`. Write valid JSON.
4. Set `lastSweep` in `config.json`.

## 3. The tracker

Edit it in place: change only the cells that changed and add rows at the end. Never rebuild, re-sort or reformat it,
so the user's own edits survive. Excel through the xlsx skill (keep formatting), Google Sheets and Notion through
their connectors, CSV as text.

## 4. Report

A short table: new roles (company, role, closes, fit), status changes (company, role, old → new), and what's due this
week. Then one line: `/apply <link>` to check a role and build its pack. For a follow-up, offer to draft a short,
polite email to the recruiter or HR for the user to copy and send (in their voice with the voice-profile mod if it's
installed). Never send it.
