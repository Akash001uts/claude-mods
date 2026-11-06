---
name: unpin
description: Remove a pinned note from the pinned-notes block. /unpin removes the latest, /unpin <n> removes number n, /unpin all clears them, and --global works on ~/.claude/CLAUDE.md instead of the project's CLAUDE.local.md.
argument-hint: "[<n> | all] [--global]"
disable-model-invocation: true
---

# /unpin

The user typed `/unpin $ARGUMENTS`. Pins live between `<!-- pinned-notes:start -->` and `<!-- pinned-notes:end -->`
in a CLAUDE.md-type file. Edit only that block.

## Which file

- Default: `CLAUDE.local.md` in the project root.
- If the arguments contain `--global` (anywhere), use `~/.claude/CLAUDE.md` (on Windows `%USERPROFILE%\.claude\CLAUDE.md`)
  instead, and remove `--global` from the arguments.

Read the file. If it doesn't exist, or has no block, or the block has no numbered pins, say "Nothing pinned." (and,
for the project file, mention `/unpin --global` if the global file has pins). Change nothing.

## What to remove

Arguments, trimmed and lowercased:

- **Empty**: the last pin (the highest number).
- **A whole number n**: pin number n. If n is not between 1 and the number of pins, say `Usage: /unpin [1-<count> | all] [--global]`
  and change nothing.
- **`all`**: every pin. Remove the whole block, from the start marker through the end marker, plus the blank line
  before it if you added one. Leave the rest of the file exactly as it was. If the file is then empty (only
  whitespace) and it's the project's `CLAUDE.local.md`, offer to delete it, but don't delete it unless they say yes.
- Anything else: show the usage line above and change nothing.

After removing one pin, renumber the remaining ones 1, 2, 3... with no gaps, keeping their order. If none are left,
remove the whole block as for `all`.

Write the change with Edit.

## What to say

One short line: `Unpinned #<n>: <first 80 characters of that pin>` or `Unpinned all <count>.`, and which file.
Then: Claude stops following it from now on in this conversation; new sessions and compaction load the file without it.

From this point on in the conversation, don't follow the removed pin any more.
