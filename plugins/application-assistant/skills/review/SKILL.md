---
name: review
description: Weekly review of the user's job applications from their application-assistant tracker - applications sent, responses, what's due, follow-ups and what to drop. Use when the user runs /apply review, or asks "how are my applications going", "weekly review".
---

# Weekly review

Read the tracker (from the profile, `~/.claude/application-assistant/profile.md`) and `reminders.json`. Run the inbox
sweep from the `check` skill first if the last one (`lastSweep` in `config.json`) is more than a day old.

Report, briefly:

- **This week:** applications sent, responses (receipts, OAs, interviews, rejections, offers), by company.
- **Totals:** applied, in progress, rejected, no response, offers; response rate.
- **Due next 7 days:** OAs, interviews, closing dates for roles marked Open - apply.
- **Follow-ups:** applications 14+ days old with no response. Offer to draft a short follow-up email for each, for the
  user to copy and send. Never send it.
- **Drop or park:** roles past closing, Open - apply rows that went stale, employers at their cap.

Set `lastReview` in `config.json` to today's date.
