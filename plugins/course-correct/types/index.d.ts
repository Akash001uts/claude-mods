// Coach's settings, per user (kept in the mod's storage).
export type Settings = {
  loop: boolean
  done: boolean
  style: boolean
  // Notes shown to the person as toasts too, not only to Claude.
  isLoud: boolean
  // Repeats of the same error (or edit) before the loop note: 1 fires on the first repeat.
  threshold: number
  // Style slips: a heads-up from then on, or Claude rewrites the reply at once.
  fix: 'headsup' | 'rewrite'
  // Whether the built-in phrase list is on; `unbanned` drops single phrases from it.
  unbanned: string[]
  bans: string[]
  // Comment lines allowed per 10 lines of code written in one edit.
  comments?: number
  language?: string
  // The first heads-up has told the person about /coach rewrite.
  toldRewrite?: true
}
