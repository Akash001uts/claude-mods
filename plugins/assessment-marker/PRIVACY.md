# Privacy: assessment-marker

Last updated 30 October 2026.

assessment-marker runs on your own computer inside Claude Code. I don't run a server for it, and it doesn't collect
anything or send anything to me or anyone else.

## What it reads

- The mod itself only checks whether a subject folder holds `.assessment-marker/subject.json`. It never opens the file.
- While marking, Claude reads the files you point it at: your draft, the brief and rubric, and anything you add during
  setup (course content, notes, past assignments, marks and feedback). The pre-submission check looks for your name and
  student ID in your files, to confirm they're there.

## What it stores, and where

- In Claude Code's plugin storage on your computer: whether it's asked the first-run question, where you want reviews
  saved, and the names and folders of up to 20 subjects you've set up.
- In each subject's folder on your computer: the files you add during setup, the reviews, snapshots of your files
  before fixes, the marker profile and the calibration log. Because these are your own assessments, they can include
  your name and student ID.

## Who it's shared with

Nobody outside Claude Code. What Claude reads while marking goes to Anthropic as part of your normal Claude Code
session, under your Claude account's terms and Anthropic's privacy policy, the same as any other file you open with
Claude. The mod adds no other service and no connectors.

## How long it's kept

Until you delete it. Delete a subject's `.assessment-marker` folder (and any reviews folder you chose) to remove that
subject's data, and uninstall the plugin to clear its plugin storage.

## Contact

Open an issue at https://github.com/Akash001uts/claude-mods/issues.
