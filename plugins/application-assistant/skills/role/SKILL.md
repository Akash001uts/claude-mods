---
name: role
description: Check one job or internship posting against the user's application-assistant profile (still open, eligibility, grad window, dates, pay, duplicates, employer caps) and, if it fits, build its application pack - a resume picked or tailored for the role, a cover letter where the form wants one, and an Application_Brief.md with the form answers. Use when the user runs /apply <link>, pastes a posting and asks "should I apply", "check this role", "build the pack for this".
argument-hint: "<posting link>"
---

# Check a role and build its pack

Read `~/.claude/application-assistant/profile.md` first (`CLAUDE_CONFIG_DIR` instead of `~/.claude` if set). If it
doesn't exist, stop and suggest `/apply setup`.

## Rules that never bend

1. **Never submit anything.** The user reviews and submits.
2. **Only claim what a base resume already says.** Tailoring reorders and rewords; it never invents experience,
   numbers, skills or titles. Check every file against the profile's never-claim list.
3. **"Still open" means open on the employer's own site**, checked live now, before anything is built.
4. **Unknown eligibility means investigate and say so**, never assume. A confirmed mismatch parks that role, not the
   whole employer.
5. **The tracker is the user's**: edit in place, never rebuild.

## 1. Check

Open the posting, then find the same role on the employer's own careers site. Check, quoting the posting:

- Still open (on the employer's site) and the closing date.
- Work rights for that location against the profile; sponsorship.
- Graduation window: only from what the posting states. Never infer it from "penultimate year" or "second year";
  if it isn't stated, it's Check.
- Dates and hours against the profile's term dates and hour limits.
- Paid.
- Not already in the tracker (link, or company plus role), and under any employer cap on the skip list.

Verdict: **Eligible**, **Ineligible** (with the reason), or **Check** (with the exact quote that's unclear and what to
ask). Ineligible: add a tracker row with status Ineligible and stop. Check: ask the user whether to go on.

## 2. Resume

Ask the user: the existing base resume for this role type, or a tailored copy? A tailored copy starts from the base,
reorders and rewords to match the posting's duties, and is saved in the pack as `Resume_<Company>.docx` (or a Google
Doc copy). The base is never edited. List every change made.

## 3. The pack

Folder: `<applications folder>/Applications/NN_Company_Role/` (NN the next number). In it:

- The resume (the base copied in, or the tailored copy).
- A cover letter, only if the form has an upload field for one. In the user's voice with the voice-profile mod if
  it's installed. At least two specific matches between the duties and real experience; no invented numbers.
- `Application_Brief.md`: date checked, link, status; the facts (grad window, dates, duties, pay); the files; form
  answers (grad date, how they heard, work rights and sponsorship, availability, salary, notice period) taken from the
  profile so they're the same across firms; risks and open questions.
- PDFs, if the form wants them: render with Word or LibreOffice if installed.

Check every file against the never-claim list and say it passed.

## 4. Tracker and reminders

Add a tracker row (status Open - apply, resume version, source). Add the closing date to `reminders.json` as a
`closes` reminder. Then: `/apply ready NN_Company_Role` before submitting, `/apply fill NN_Company_Role` to fill the
form.
