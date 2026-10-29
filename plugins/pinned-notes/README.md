# pinned-notes

Sometimes there's one thing I need Claude to remember for the whole session, like "use Australian spelling", "don't
touch the tests folder" or the name of the branch I'm on. If I just say it once, it scrolls away, and after a compact
it can get lost in the summary. This mod lets you pin it instead.

## How it works

- `/pin Use Australian spelling` pins a note. It shows above the prompt with a 📌 and stays there for the rest of the
  session.
- `/pin` on its own pins the last message you typed, so you can pin something after you've already said it.
- Claude gets the pinned notes in its system prompt, told to treat them as standing instructions. Because they're in
  the system prompt and not the conversation, they're still there after a compact.
- `/pin list` shows every pin in full, `/unpin 2` removes one, `/unpin` on its own removes the latest one, and
  `/unpin all` clears them.
- `/pin hide` and `/pin show` hide or show the notes above the prompt. Claude still sees them while they're hidden.
- Links in a pin (anything starting `http://` or `https://`) are clickable. In the terminal that's ctrl+click in most
  terminals; if yours doesn't support links, it shows the text with the URL after it.
- A pin that's too long for one line gets cut to fit, but its links stay on screen: the text around them is shortened
  first (with a …), and if that's not enough the link's text shortens too.
- A pin that's been cut off ends in a ▾. Click its text (or the ▾) and it opens out to the full text, wrapped over as
  many lines as it needs. "▴ show less" folds it back. Links work either way, cut off or not. In the terminal, clicking works in fullscreen mode; otherwise press ctrl+x tab to move into the
  band, Tab to the pin and Enter.
- If you have more than a few pins, the band shows the first couple and a "+N more" line so it doesn't take over the
  screen.
- Pins stay until you unpin them, not just for one session. When you start a new session (or `/clear`), it asks
  whether to keep the pins from your last session in the same project, listing them so you know what you're keeping. "Keep them" carries
  them over, "Unpin them" leaves them behind and it won't ask about those again. If you close the question without
  answering, they're kept, and `/unpin all` clears them. Pins from one project are never offered in another.
- If you resume a session with `claude --resume`, its own pins come back without asking.
- Once you `/unpin all`, there's nothing to carry over, so the next session doesn't ask.

Up to 20 pins, each up to 1000 characters.

## What it runs and stores

- **What it adds to the system prompt.** While anything is pinned, one section listing your pins and telling Claude to
  keep to them. It only changes when you pin or unpin something, but each change does mean the next request re-caches
  the conversation, so it costs a bit more that one time.
- **What it reads.** The text of the prompts you type, only so `/pin` on its own can pin the last one. It keeps the
  latest one in memory and doesn't store or send it anywhere. Slash commands and messages from other tools are skipped.
- **What it asks.** At the start of a new session, if your last session left pins, one question (Claude Code's own
  question box) asking whether to keep them. Nothing is asked when there's nothing to carry over, when you resume a
  session, or in a `claude -p` run.
- **What it stores.** Your pins, in Claude Code's plugin storage, keyed by session id so a resumed session gets them
  back, plus one copy of the latest pins per project (keyed by the project's folder path) so the next session there
  can offer them. It keeps the last 50 sessions with pins
  and deletes older ones. Unpinning everything deletes that session's entry and the copy; "Unpin them" deletes the
  copy.
- It doesn't run commands, call tools, change your prompts or send anything outside Claude Code.

## What each hook does

The mod is one file, `hooks/register.tsx`. It hooks these events and nothing else:

- `session.start`: registers `/pin` and `/unpin`, loads the session's own pins (on a resume or reload), and if there
  are none, asks whether to keep your last session's pins from this project.
- `classic.SessionStart` (only when the source is `clear`): `/clear` starts a new session without `session.start`, so
  this asks the same question after a `/clear`. It doesn't change anything the event carries.
- `prompt.submit`: reads the text of a prompt you typed (not slash commands or other tools' messages) and keeps the
  latest one in memory for `/pin` on its own. It passes the prompt on unchanged.
- `prompt.compose`: while anything is pinned, adds one section listing your pins at the end of the system prompt.
  It leaves the other sections, your settings, instructions and tool descriptions as they are.
- `command.run` (for `/pin` and `/unpin` only): pins, lists, hides, shows or unpins notes.
- `ui.render` for the area above the prompt: draws the pins. Anything else drawn there by Claude Code or other plugins
  still shows.

It never runs commands or processes, reads or writes your files, makes network requests, or answers tool calls.

This mod used to be called session-pins (the directory flagged that name as too close to another listing). Pins saved
under the old name don't carry over.

## Licence

MIT
