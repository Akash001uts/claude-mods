---
name: ready
description: Run the 7-point pre-submit check on an application pack built by application-assistant - still open, grad window, work rights, dates and hours, pay, two real matches with no invented numbers, not a duplicate and under the cap - then save the submitted files and receipt. Use when the user runs /apply ready <role>, or says "am I ready to apply", "check before I submit", "I've submitted it".
argument-hint: "<role folder or company>"
---

# Pre-submit check

Find the pack (`Applications/NN_Company_Role/` in the applications folder from
`~/.claude/application-assistant/config.json`) and read its `Application_Brief.md` and files, and the profile.

## The seven checks

Each one gets ✓, ✗ (with why) or ? (with what to check):

1. **Still open**, on the employer's own site, checked live now.
2. **Grad window fits**, from what the posting states.
3. **Work rights fit** for the location, sponsorship included.
4. **Dates and hours are workable** against the profile.
5. **Paid**, or pay asked about.
6. **At least two specific matches** between the duties and the user's real experience, and **no invented
   numbers**: every claim in the resume and cover letter is in a base resume, and nothing on the never-claim list
   appears.
7. **Not a duplicate and under the employer's cap.**

Any ✗ means don't submit yet; say what to fix. All ✓ (or ? the user accepts): ready.

## After they submit

When the user says they've submitted: save the submitted files and the receipt (a screenshot or the confirmation
email) in the pack, set the tracker row to Applied with today's date (edit in place), and update the brief's status.
