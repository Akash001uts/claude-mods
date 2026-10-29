// Tool guards' settings, per user (kept in the mod's storage).
export type Settings = {
  edits: boolean
  attribution: boolean
  reads: boolean
  // A note shows when a guard steps in.
  isLoud: boolean
  // Shell edits caught in every permission mode, or only in auto mode.
  editsScope: 'always' | 'auto'
  // Attribution lines taken out of the command quietly, or the command refused.
  attributionMode: 'fix' | 'refuse'
}
