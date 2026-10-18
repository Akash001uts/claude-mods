---
name: ready
description: Check a university assessment is ready to upload - the exact files, names and formats, limits, leftovers, identity details, referencing, live fields, the AI-use disclosure and the deadline - without marking it or re-reading the content. Use when the user says they're about to submit, "am I ready to submit", "are these the right files", "just check it compiles", or when the assessment-marker plugin asks for a readiness check.
argument-hint: "[assessment]"
---

# Readiness check

One question: **can these exact files be uploaded right now?** No mark, no quality review. If the user wants a mark,
that's the `assessment-marker:mark` skill.

Use only the active subject's folder. Start straight away; the first line names the assessment and the files.

## 1. Find the files to upload

- From the brief: the required set, filenames and formats.
- From the assessment folder: the candidate files. If several copies exist (`final`, `final (1)`, an older export in
  another folder), list them with modified times and say which one is current and which are stale. Ask only if you
  genuinely can't tell.
- Hash each one (`sha256sum` in Bash, `Get-FileHash` in PowerShell). If the last review in
  `.assessment-marker/reviews/<assessment>/` recorded different hashes, say the files changed since that review
  (and offer a re-mark, don't run one).

## 2. The checks

| Check | What to look for |
|---|---|
| Files | exactly the required set; exact filenames; exact formats (a genuine `.xls`, not a renamed `.xlsx`; a real PDF export) |
| Right copies | no stale copies picked by mistake; no `~$` lock files (the file is still open); edits actually saved (modified time, hash) |
| Code runs | notebooks and scripts run top to bottom from a clean copy with only the stated dependencies; the saved file has no error outputs or unexecuted cells |
| Limits | page and word limits using the brief's own counting rule (what's in and out: references, appendices, captions, in-text citations). State the method. Flag sitting exactly at a maximum |
| Leftovers | placeholders (`[insert ...]`, `TODO`, `XX`), template instructions, production notes ("draft", "master copy"), empty headings, comments and tracked changes |
| Identity | name, student ID, subject code and assessment title wherever the brief requires them |
| Referencing | every citation has a reference and every reference is cited; the required style (from the subject outline, else say it's assumed) |
| Live fields | table of contents, figure numbers and cross-references updated before export |
| AI disclosure | section 3 |
| Deadline | the due date and time; if the brief or Canvas give two, say so and which one you used |

Render pages where a check needs to see them (placeholders, empty headings, the contents page). Don't re-read the
content for quality.

## 3. The AI-use disclosure

- Find the disclosure the brief asks for (an appendix, a statement, a form). Missing when required is a blocker.
- Ask the user what they want to disclose if it isn't written yet. **It's their declaration.**
- Compare it with what Claude did **in this session** (drafting, rewriting, code, charts, research, marking and
  review) and anything the user has told you. Marking and reviewing count as AI use.
- If the disclosure says less than that, say so plainly and specifically: "This says Claude was used for a final
  check, but in this session it also rewrote the discussion section and built two charts." Recommend being honest:
  a disclosure that understates AI use is a false declaration on a graded assessment, which is a worse position than
  the honest version. The user decides; don't rewrite their disclosure unless they ask.
- Never help hide AI use, lower its apparent extent, or chase AI-detector scores.

## 4. The result

Save it like a review: always the mod's own copy at
`<subject>/.assessment-marker/reviews/<assessment>/<YYYY-MM-DD-HHMM>-ready.md`, and also per the user's save choice
(default `outputs/_audits/<assessment>_readiness_<YYYY-MM-DD>.md`) unless it's chat only or they say otherwise.

```
# <assessment>: ready to submit? <Yes | Yes, after N fixes | No>

## Blockers            (must fix before upload, each with where and the fix)
## Worth fixing        (won't stop the upload)
## Checks passed       (one line each)
## Upload these        (exact path, size, sha256, one per line)
```

End with: this checks the files, not the mark, and can't confirm what Canvas will accept.
