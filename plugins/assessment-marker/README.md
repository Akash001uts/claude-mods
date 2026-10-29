# assessment-marker

I mark my own uni assessments with Claude before I submit them, to find out what's stopping them from being a High
Distinction. Over a semester I worked out a process that actually works (and found a few ways it goes wrong, like
grading against my own notes instead of the real rubric, or a "quick grade" that came out a few marks too generous).
This mod is that process, so I don't have to paste a giant prompt and re-explain it every time.

The bar is always HD (85+). It doesn't ask what grade you're aiming for, and it doesn't go easy because the due date
is close. It's strict on purpose: the point is to find the problems before the real marker does.

To install:

```
/plugin install assessment-marker --marketplace Akash001uts/claude-mods
```

## How it works

- **First run:** one question, where to keep your reviews: a folder in each subject (`outputs/_audits`), chat only,
  or a folder or file name you type in. You can override it for any single review ("just show it here this
  time").
- **Set up each subject once.** Say "set up this subject" (or `/mark setup`). You tick what you can add, then it walks
  you through each one: where to get it (like downloading your Canvas files), what formats are fine, and where it
  goes. The list is course content, the subject outline, your own notes, notes from others, past assignments with
  their marks and feedback, tutor clarifications, exemplars and templates. You only need the brief, the rubric and
  your draft; the rest makes the review sharper, and it tells you what's missing and what that costs.
- Every subject is kept separate. Marking one never reads another subject's files, notes or reviews.
- **Then just ask normally.** "Grade it now", "how does this score?", "I've fixed those, check again", "am I ready to
  submit?" It works out which subject you're in from the folder, and which stage you're at:
  - **First mark:** it models the real rubric first (whatever shape it is: weighted, points, holistic, "missing one
    X is a D"), then reads everything the way a marker would: it renders every page, runs your notebook in a fresh
    environment, checks spreadsheet formulas, recomputes the main numbers from the raw data and checks your sources.
    You get the full nine-section review every time: verdict with a range and confidence, the rubric model, a
    marking table with "what stops the next band" per criterion, risks, what it verified, ranked weaknesses with the
    smallest fix and what it's worth, page-by-page notes, a revision plan (exact text to find, the replacement and
    the word-count effect) and a submission checklist.
  - **Re-mark** (your files changed since the last review): it marks from scratch, then compares: what's fixed, what
    isn't, how each criterion moved, and anything good that got lost in a rewrite.
  - **Ready to submit:** no mark, just "can I upload these exact files now?": right files, names and formats, word
    and page limits, placeholders, your name and ID, referencing, the contents page, the AI disclosure and the deadline.
- It never edits your work while marking. You decide what to fix and how: one thing at a time, a few, or all of it.
  It saves a copy of your files before the first fix so you always have something safe to submit.
- **AI disclosure:** you decide what you disclose. If it doesn't match what Claude actually did in the session
  (including the marking), it tells you and recommends being honest. It won't help hide AI use.
- **When marks come back,** give it the marks and feedback. It compares them with what it predicted, per criterion,
  and keeps a short profile of what that subject's marker cares about, so the next review in that subject is better.
  It can also tell you if a mark looks fair and, if you want, help write a polite email asking about it.
- **Second opinion:** it can write a self-contained prompt for another model or chat to mark the same work
  independently, then compare the two reviews when you paste the other one back.
- `/mark` is there if you want to run it on purpose: `/mark`, `/mark ready`, `/mark setup`. You never have to use
  it.

## What it runs and stores

- **What it asks.** In the first session after install (not under `claude -p`), one question in Claude Code's own
  question box: where to keep reviews. It only asks on its own until you answer or close it (closing keeps the
  default folder).
- **What it sends to Claude.** `/mark`, `/mark ready` and `/mark setup` each submit one short prompt asking Claude
  to run the matching skill. The prompt is fixed text: that request and the skill's name, nothing else. Nothing the
  mod reads (the subject file, your files, plugin storage) ever goes into a prompt it submits. Nothing is submitted
  unless you run one of them.
- **What it reads.** Nothing. To find your subject, it checks whether `.assessment-marker/subject.json` exists in the
  folder Claude Code is open in, or up to 7 folders above it, whenever Claude Code builds its system prompt. It never
  opens the file: the subject goes by its folder's name, and Claude reads the file itself while marking.
- **What it adds to the system prompt.** One section: the active subject and its folder (or the subjects you've set
  up, if you're outside one), where reviews are kept, and which skill to use for which request.
- **What it stores.** In plugin storage: whether it's asked the first-run question, your save choice, and the names
  and folders of up to 20 subjects you've set up. Everything else is written by Claude, not by the mod, inside each
  subject's own folder: `.assessment-marker/` (the subject file, the marker profile, the calibration log, a copy of
  every review, snapshots of your files before fixes, second-opinion prompts) plus `outline/`, `content/`, `notes/`,
  `past/` and your reviews if you chose a folder.
- **What Claude runs while marking.** Reading and rendering your files, running your notebooks or scripts from a copy,
  and hashing the files to submit, all through Claude Code's normal tools and your usual permission prompts. It never
  changes your submission files while marking.
- Nothing is sent anywhere outside Claude Code. It doesn't register tools or change your settings. Delete a subject's
  `.assessment-marker` folder to start that subject over.

[Privacy](PRIVACY.md): what it reads and stores, where, and how to delete it.

## What each hook does

The mod is one file, `hooks/register.ts`. It hooks these events and nothing else:

- `session.start`: registers the `/mark` command, looks for the subject folder, and in the first interactive session
  asks the one save question.
- `prompt.compose`: adds its one section (described above) to the end of the system prompt. It doesn't change or
  remove anything else in the system prompt, your instructions, other plugins' sections or tool descriptions.
- `command.run` (for `/mark` only): checks the argument and submits the fixed prompt for that stage. Any other
  argument just shows the usage line.

It never runs commands or processes, reads or writes your files, makes network requests, registers tools or answers tool
calls.

## Licence

MIT
