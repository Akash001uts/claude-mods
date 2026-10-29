// Needs-you's settings, per user (kept in the mod's storage).
export type Settings = {
  turns: boolean
  permissions: boolean
  questions: boolean
  // Suggests an allow rule for a command approved again and again.
  counter: boolean
  // Minutes Claude waits on you before a ping.
  waitMin: number
}
