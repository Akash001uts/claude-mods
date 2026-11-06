---
name: ready-check
description: Check a university assessment (assignment, report, notebook, uni submission) is ready to upload to Canvas - the exact files, names and formats, word and page limits, leftovers, name and student ID, referencing, live fields, the AI-use disclosure and the deadline - without marking it. Use when the user is about to submit uni work, "am I ready to submit my assignment", "are these the right files to upload", "just check it compiles before I submit", or types /mark ready or /ready-check. Not for job applications.
argument-hint: "[assessment]"
---

# Readiness check

One question: **can these exact files be uploaded right now?** No mark, no quality review. If the user wants a mark,
that's the `assessment-marker-lite:mark` skill.

Find the subject as in "Finding the subject" at the end of this skill, and use only that subject's folder. Start
straight away, without asking permission; the first line names the assessment and the files.

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

## Where reviews are saved

`saveTo` in the config file: `outputs/_audits` (a folder inside the subject folder, the default), `chat` (chat only),
or a folder or file name the user typed (relative to the subject folder unless it's absolute).

If `saveTo` is missing, ask once, the first time you're about to save, with AskUserQuestion: header `Reviews`,
question "Where should I keep your assessment reviews?", options `In each subject folder (outputs/_audits)` and
`Chat only` (they can type their own folder or file name under Other). Store `outputs/_audits`, `chat`, or the typed
text trimmed to 200 characters. If they dismiss it, store `outputs/_audits` so it isn't asked again. Then say in one
line where reviews go and that "just show it here" or "save this one as X" overrides it for one review.

The mod's own copy in `<subject>/.assessment-marker/reviews/` is always written, whatever the choice.

## Finding the subject

A subject folder is one that holds `.assessment-marker/subject.json`. Its name is the folder's own name (the full name
and assessments are in `subject.json`).

1. If the user named a subject folder, or the files they're talking about sit inside one, use that.
2. Otherwise look in the working folder and up to 7 folders above it, nearest first, in one command, e.g.
   Bash: `d="$(pwd -W 2>/dev/null || pwd)"; for i in 1 2 3 4 5 6 7 8; do [ -f "$d/.assessment-marker/subject.json" ] && { echo "$d"; break; }; p=$(dirname "$d"); [ "$p" = "$d" ] && break; d="$p"; done`
   PowerShell: `$d=(Get-Location).Path; for($i=0;$i -lt 8 -and $d;$i++){ if(Test-Path (Join-Path $d '.assessment-marker\subject.json')){ $d; break }; $d=Split-Path $d -Parent }`
3. Not found: read `subjects` in the config file (below) and ask which subject with AskUserQuestion: the set-up
   subjects plus `New subject` (which runs the `assessment-marker-lite:subject-setup` skill). No subjects yet: offer setup.
4. Once you have the subject, keep the config's `subjects` list current: put `{"name": "<folder name>", "path":
   "<absolute folder path>"}` first, drop any other entry with the same path, keep at most 20. Don't rewrite the file
   if it's already first. Write paths with forward slashes and a drive letter on Windows
   (`C:/Uni/...`, not `/c/Uni/...` or `C:\Uni\...`) so the same folder never appears twice.

## The config file

`~/.claude/assessment-marker/config.json` (home is `$HOME` in Bash, `$env:USERPROFILE` in PowerShell). Create the
folder and file if they're missing. Shape:

```json
{ "saveTo": "outputs/_audits", "subjects": [ { "name": "31250 Intro Data Analytics", "path": "C:/Uni/31250 Intro Data Analytics" } ] }
```

Keep any other keys as they are when you write it.
