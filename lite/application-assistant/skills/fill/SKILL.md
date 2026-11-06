---
name: fill
description: Fill a job application form in the user's Chrome (Claude in Chrome) from an application-assistant pack's Application_Brief.md and profile, and stop before submit for the user to review and submit. Use when the user runs /apply fill <role>, or says "fill in the application", "do the form for me".
argument-hint: "<role folder or company>"
---

# Fill the form

Read the pack's `Application_Brief.md` and the profile (`~/.claude/application-assistant/profile.md`). Load the
Claude in Chrome tools and open the posting's application form in a new tab.

- Fill fields from the brief's form answers and the profile, so availability, work rights and grad date read the
  same across every firm. Upload the pack's resume (and cover letter where there's a field for one).
- Claude's own safety rules apply and this skill doesn't change them: ask before entering personal details, never type
  passwords or ID numbers, and **never submit**. Logins and CAPTCHAs are the user's to do.
- A question the brief doesn't answer: stop and ask the user, then add the answer to the brief's form answers for
  next time.
- Stop on the last page before submit. List what was filled, anything left blank and why, then tell the user to
  review the form and submit it themselves, and to run `/apply ready <role>` if they haven't yet.
