// Reading what the Slack connector sends back, and the DM's wording. No `$` in here, so it can be tested on its own.

// The claude.ai Slack connector's tools, by the end of their names. Not yet checked against a connected account:
// these are the names Slack's own MCP server uses. The server is found from the tool list, so its name is never
// assumed.
export const SLACK = {
  send: 'slack_send_message',
  thread: 'slack_read_thread',
  channel: 'slack_read_channel',
  profile: 'slack_read_user_profile',
} as const

export type Message = { ts: string; text: string; user?: string; isBot: boolean; threadTs?: string }

// Every object in a value that looks like a Slack message (has `ts` and `text`), however deep the reply nests it.
export function messages(value: unknown): Message[] {
  const out: Message[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (typeof o.ts === 'string' && typeof o.text === 'string')
      out.push({
        ts: o.ts,
        text: o.text,
        user: typeof o.user === 'string' ? o.user : undefined,
        isBot: Boolean(o.bot_id ?? o.bot_profile ?? (o.subtype === 'bot_message')),
        threadTs: typeof o.thread_ts === 'string' ? o.thread_ts : undefined,
      })
    for (const child of Object.values(o)) if (child && typeof child === 'object') walk(child)
  }
  walk(value)
  return out
}

// A connector result's text blocks, parsed as JSON where they are JSON.
export function parsed(content: readonly { type: string; text?: string }[], structured?: unknown): unknown[] {
  const out: unknown[] = structured === undefined ? [] : [structured]
  for (const block of content) {
    if (block.type !== 'text' || !block.text) continue
    try {
      out.push(JSON.parse(block.text))
    } catch {
      out.push(block.text)
    }
  }
  return out
}

// A field anywhere in a result: the first string under one of the names given.
export function field(value: unknown, names: readonly string[]): string | undefined {
  if (typeof value === 'string') {
    for (const n of names) {
      const m = new RegExp(`"${n}"\\s*:\\s*"([^"]+)"`).exec(value) ?? new RegExp(`\\b${n}\\s*[:=]\\s*([\\w.]+)`).exec(value)
      if (m) return m[1]
    }
    return undefined
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const got = field(v, names)
      if (got) return got
    }
    return undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const o = value as Record<string, unknown>
  for (const n of names) if (typeof o[n] === 'string' && o[n]) return o[n] as string
  for (const v of Object.values(o)) {
    const got = field(v, names)
    if (got) return got
  }
  return undefined
}

export const isYes = (text: string) => /^\s*(y|yes|yep|yeah|allow|approve|ok|okay|go|go ahead|sure|do it)\b/i.test(text)
export const isNo = (text: string) => /^\s*(n|no|nope|deny|don't|dont|stop|cancel)\b/i.test(text)

// Slack's own markup taken off a reply: <@U123> mentions, <url|label> links, and HTML entities.
export const plain = (text: string) =>
  text
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<([^>]+)>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()

// Replies longer than this are cut, with a pointer back to the machine.
export const MAX_DM = 3000
export const cut = (text: string) => (text.length <= MAX_DM ? text : `${text.slice(0, MAX_DM).trimEnd()}… (full reply on your machine)`)

export type Question = { question: string; options?: { label: string }[]; multiSelect?: boolean }

// The option a reply picks: its number or its label. Undefined for a free-text answer.
export function pick(reply: string, options: readonly { label: string }[]): string | undefined {
  const r = reply.trim().toLowerCase().replace(/[.!]$/, '')
  if (/^\d+$/.test(r)) return options[Number(r) - 1]?.label
  return options.find(o => o.label.toLowerCase() === r)?.label
}

export const pingText = {
  turn: (name: string, session: string, reply: string) =>
    `Hey ${name}, ${session} has returned a reply:\n\n${cut(reply)}\n\nReturn to your machine to continue, or reply here with your follow-up.`,
  permission: (name: string, session: string, what: string) =>
    `Hey ${name}, ${session} is asking permission to run \`${what.slice(0, 500)}\`. Reply yes or no.`,
  question: (name: string, session: string, qs: readonly Question[]) =>
    `Hey ${name}, ${session} has a question for you:\n\n${qs
      .map(q => `${q.question}${q.options?.length ? `\n${q.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}` : ''}`)
      .join('\n\n')}\n\nReply with a number, an option, or your own answer.`,
}
