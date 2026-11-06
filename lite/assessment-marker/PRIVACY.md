# Privacy: assessment-marker (lite)

Last updated 7 November 2026.

assessment-marker runs on your own computer inside Claude Code. It's only skills (instructions for Claude), with no
code of its own. I don't run a server for it, and it doesn't collect anything or send anything to me or anyone else.

## What it reads

- To find your subject, Claude checks for `.assessment-marker/subject.json` in the folder you're working in or up to 7
  folders above it, and reads `~/.claude/assessment-marker/config.json`.
- While marking, Claude reads the files you point it at: your draft, the brief and rubric, and anything you add during
  setup (course content, notes, past assignments, marks and feedback). The pre-submission check looks for your name and
  student ID in your files, to confirm they're there.

## What it stores, and where

- In `~/.claude/assessment-marker/config.json` on your computer: where you want reviews saved, and the names and
  folders of up to 20 subjects you've set up.
- In each subject's folder on your computer: the files you add during setup, the reviews, snapshots of your files
  before fixes, the marker profile and the calibration log. Because these are your own assessments, they can include
  your name and student ID.

## Who it's shared with

Nobody outside Claude Code. What Claude reads while marking goes to Anthropic as part of your normal Claude Code
session, under your Claude account's terms and Anthropic's privacy policy, the same as any other file you open with
Claude. If you ask whether a mark is fair, Claude may search the web for your university's review policy. The plugin
adds no other service and no connectors.

## How long it's kept

Until you delete it. Delete a subject's `.assessment-marker` folder (and any reviews folder you chose) to remove that
subject's data, and delete `~/.claude/assessment-marker/` to clear the save choice and subject list.

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
