// What the skills write to ~/.claude/application-assistant/config.json (the profile itself is profile.md).
export type Config = {
  // The folder holding the tracker and the packs; the rundown and the band show only there.
  applicationsDir: string
  // When the daily scan runs, HH:MM local time.
  scanTime?: string
  // ISO time of the last scan, whether it worked, and why not.
  lastScan?: string
  lastScanOk?: boolean
  lastScanError?: string
  // The last digest's date and how many new roles it had.
  lastDigest?: string
  newRoles?: number
  // Weekday name of the weekly review, or absent when it's off; the last one's date.
  weeklyReview?: string
  lastReview?: string
}

// A due date the skills keep in ~/.claude/application-assistant/reminders.json.
export type Reminder = {
  what: string
  // YYYY-MM-DD
  due: string
  kind: 'oa' | 'interview' | 'closes' | 'followup' | 'other'
  role?: string
  done?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'application-assistant': {
      reminders: Reminder[]
      // This session runs in the applications folder.
      isHere: boolean
    }
  }
}
