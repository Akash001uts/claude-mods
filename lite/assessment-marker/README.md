# assessment-marker (lite)

This is the code-free version of my assessment-marker mod. It's only skills (Markdown files), no hooks module, so it
fits the plugin directory's rules. I'm using it for a while to see if it's good enough without the code.

## What it does

I mark my own uni assessments with Claude before I submit them, to find out what's stopping them from being a High
Distinction. This is the process I worked out over a semester, so I don't have to paste a giant prompt every time.

The bar is always HD (85+). It doesn't ask what grade you're aiming for and it doesn't go easy because the due date is
close. It's strict on purpose: the point is to find the problems before the real marker does.

- **Set up each subject once.** You tick what you can add (course content, subject outline, your notes, notes from
  others, past assignments with marks and feedback, tutor clarifications, exemplars, templates) and it walks you
  through each one. You only really need the brief, the rubric and your draft.
- **Mark:** it models the real rubric first, then reads everything like a marker would (renders every page, runs your
  notebook from a clean copy, checks spreadsheet formulas, recomputes the main numbers, checks sources) and gives the
  full nine-section review: verdict with a range and confidence, rubric model, marking table, risks, what it verified,
  ranked weaknesses with the smallest fix, page-by-page notes, a revision plan with exact find-and-replace text, and a
  submission checklist.
- **Re-mark:** if your files changed since the last review, it marks from scratch, then compares: what's fixed, what
  isn't, how each criterion moved, and anything good that got lost.
- **Ready to submit:** no mark, just "can I upload these exact files now?" (files, names, formats, limits,
  placeholders, name and ID, referencing, contents page, AI disclosure, deadline).
- **Marks back:** compares the real marks with what it predicted per criterion and keeps a short profile of what that
  subject's marker cares about. It can also tell you if a mark looks fair and help write a polite email about it.
- **Second opinion:** writes a self-contained prompt for another model or chat to mark the same work, then compares the
  two reviews when you paste the other one back.
- Every subject is kept separate. It never edits your work while marking, and it snapshots your files before the first
  fix. It won't help hide AI use in your disclosure.

## Install

```
/plugin install assessment-marker-lite --marketplace Akash001uts/claude-mods
```

Install this or the code version (`assessment-marker`), not both: they have the same commands and do the same job, so
having both just doubles everything up.

## How to use it

Mostly just ask in plain words. Claude picks the right skill from what you say:

| You say | What runs |
|---|---|
| "grade it now", "how does this score?", "is this HD?", "I've fixed those, check again", "which draft is best?" | mark |
| "am I ready to submit?", "are these the right files to upload?" | ready-check |
| "my marks came back", "is this mark fair?", "should I ask for a re-mark?" | marks-back |
| "write a prompt for ChatGPT to mark this", or paste another review and ask "do you agree?" | second-opinion |
| "set up this subject", "new subject", "add my course content" | subject-setup |

Or type a command:

| Command | Fallback if another plugin has the same name |
|---|---|
| `/mark` (or `/mark A2` for a specific assessment) | `/assessment-marker-lite:mark` |
| `/mark ready` or `/ready-check` | `/assessment-marker-lite:ready-check` |
| `/mark setup` or `/subject-setup` | `/assessment-marker-lite:subject-setup` |
| `/marks-back` | `/assessment-marker-lite:marks-back` |
| `/second-opinion` | `/assessment-marker-lite:second-opinion` |

I named them `ready-check` and `subject-setup` (not `ready` and `setup`) because other plugins of mine already have a
bare `/ready` and `/setup`.

The first time it saves a review, it asks once where to keep reviews: in each subject folder (`outputs/_audits`),
chat only, or a folder or file name you type. Say "just show it here" or "save this one as X" on any review to
override it.

## What's different from the code version

- **`/mark`, `/mark ready`, `/mark setup`:** kept. `/mark` is now the mark skill itself, and it hands `ready` and
  `setup` over to the other skills. Anything else you type after `/mark` is taken as the assessment name (the old
  version showed a usage line instead).
- **Picking the right skill:** changed. The code added a section to the system prompt saying which skill to use for
  which request. Now the skill descriptions carry that, with the trigger phrases in them. It should work the same, but
  it's Claude matching your words to a description, so an unusual phrasing might not trigger it (use the command then).
- **"Only start a review on a clear request, answer small questions normally" and "start straight away":** kept, now
  written inside the skills.
- **Active subject:** changed. The code looked for `.assessment-marker/subject.json` in the folder Claude Code is open
  in or up to 7 folders above on every prompt and told Claude about it. Now each skill does that same search itself
  when it runs (one shell command), so it costs nothing until you ask for something.
- **List of set-up subjects (up to 20):** kept, moved from plugin storage to `~/.claude/assessment-marker/config.json`.
  When you're not in a subject folder it asks which of those you mean, or offers to set up a new one.
- **First-run save question:** changed. It used to pop up in the first session after install. Now it's asked the first
  time a skill actually needs to save a review, and the answer goes in the same config file.
- **Existing answers from the code version:** the old save choice and subject list were in plugin storage, which a
  code-free plugin can't read, so it asks the save question once more and rebuilds the subject list as you use your
  subjects. Everything in your subject folders (`.assessment-marker/`, reviews, profiles, calibration) is the same
  format and keeps working.
- **All five skills' marking, readiness, marks-back, second-opinion and setup steps:** kept as they were, apart from
  the renames above and pointing them at the config file instead of the old system-prompt section.
- **The toast when `/mark` couldn't start:** gone (there's nothing to fail now).
- **Hooks:** none. Nothing runs on its own at session start or on each prompt.

## What it runs and stores

- **Files it writes, all through Claude's normal tools** (so you get the usual permission prompts):
  - `~/.claude/assessment-marker/config.json`: your save choice (`saveTo`) and up to 20 subjects (name and folder).
  - In each subject folder: `.assessment-marker/` (subject.json, the marker profile, the calibration log, a copy of
    every review, snapshots of your files before fixes, second-opinion prompts), plus `outline/`, `content/`,
    `notes/`, `past/`, and your reviews if you chose a folder (default `outputs/_audits/`).
- **What Claude runs:** a short shell command to look for the subject folder (it checks the folders above where you
  are, which can mean a permission prompt for a folder outside your project), reading and rendering your files,
  running your notebooks or scripts from a copy in a temp folder, and hashing the files you'll submit. It never changes
  your submission files while marking.
- **What leaves the machine:** only what Claude reads in your normal Claude Code session, going to Anthropic like any
  other file you open with Claude. marks-back may look up your uni's review or appeal policy on the web if you ask
  whether a mark is fair. No other service.
- It doesn't change your settings or your CLAUDE.md. Delete a subject's `.assessment-marker` folder to start that
  subject over, and `~/.claude/assessment-marker/` to clear the save choice and subject list.

[Privacy](PRIVACY.md)

## Licence

MIT
