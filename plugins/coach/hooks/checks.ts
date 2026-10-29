// Coach's checks on plain text: errors, verification commands, banned phrases, comment density and reply language.
// No `$` in here, so each can be tested on its own.

// The tics people complain about most in the GitHub reports. A starter list: /coach unban drops any of them.
export const BUILT_IN = [
  "You're absolutely right",
  'belt-and-suspenders',
  'belt and suspenders',
  'Great question',
  'I hope this helps',
  "Let me know if you'd like",
  'rest assured',
  "It's worth noting",
]

// The line of a command's output that says what went wrong, with what changes between runs (numbers, paths, quoted
// names, addresses) taken out, so the same error after an edit still matches.
export function errorKey(text: string): string | undefined {
  const line = text
    .split('\n')
    .map(l => l.trim())
    .find(l => /\b(error|exception|traceback|panic|failed|failure|cannot|undefined reference|segmentation fault)\b/i.test(l))
  if (!line) return undefined
  return line
    .replace(/0x[0-9a-f]+/gi, '#')
    .replace(/(?:[A-Za-z]:)?[\w.~-]*[\\/][\w.\\/-]+/g, '<path>')
    .replace(/(["'`]).*?\1/g, '<q>')
    .replace(/\d+(\.\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, 200)
}

// Commands that check the work: tests, builds, type checks, linters, or running the program itself.
const VERIFY = [
  /\b(pytest|jest|vitest|mocha|ava|tap|phpunit|rspec|ctest|unittest)\b/,
  /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|check|typecheck|lint|start|dev)\b/,
  /\b(npx|bunx)\s+(tsc|jest|vitest|playwright|eslint)\b/,
  /\b(tsc|mypy|pyright|ruff|eslint|clippy|go\s+vet)\b/,
  /\bcargo\s+(test|build|check|run|clippy)\b/,
  /\bgo\s+(test|build|run)\b/,
  /\bdotnet\s+(test|build|run)\b/,
  /\b(mvn|gradle|gradlew|make|cmake\s+--build|ninja|bazel)\b/,
  /\b(python|python3|py|node|deno|ruby|php|java)\s+\S/,
  /\bclaude\s+plugin\s+(test|validate)\b/,
  /(^|[\s;&|])\.\/\S+/,
]
export const verifies = (command: string) => VERIFY.some(re => re.test(command))

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Phrases found in the text, matched as whole words, ignoring case.
export function banned(text: string, phrases: readonly string[]): string[] {
  const flat = text.replace(/[’‘]/g, "'")
  return phrases.filter(p => new RegExp(`(^|[^\\w-])${escape(p.replace(/[’‘]/g, "'"))}(?=$|[^\\w-])`, 'i').test(flat))
}

const COMMENT = /^\s*(\/\/|#(?!include|define|if|endif|pragma|!)|\/\*|\*(?!\*)|\*\/|--\s|;;|<!--|""")/

// Comment lines per 10 lines of code in what one edit wrote. Undefined below 5 lines, too few to judge.
export function commentRate(code: string): number | undefined {
  const rows = code.split('\n').filter(l => l.trim())
  if (rows.length < 5) return undefined
  const comments = rows.filter(l => COMMENT.test(l)).length
  const lines = rows.length - comments
  return lines === 0 ? 10 : (comments / lines) * 10
}

// Which language most of a reply is in: by script, and for Latin-script languages by their most common words.
// Free and rough, enough to catch a reply that switched language. Code blocks and inline code are left out.
const SCRIPTS: [string, RegExp][] = [
  ['chinese', /[一-鿿]/g],
  ['japanese', /[぀-ヿ]/g],
  ['korean', /[가-힯]/g],
  ['russian', /[Ѐ-ӿ]/g],
  ['arabic', /[؀-ۿ]/g],
  ['hindi', /[ऀ-ॿ]/g],
  ['thai', /[฀-๿]/g],
  ['greek', /[Ͱ-Ͽ]/g],
  ['hebrew', /[֐-׿]/g],
]
const WORDS: Record<string, string[]> = {
  english: ['the', 'and', 'is', 'to', 'of', 'that', 'it', 'you', 'this', 'with', 'for', 'are'],
  spanish: ['el', 'la', 'que', 'de', 'y', 'es', 'en', 'los', 'para', 'con', 'una', 'por'],
  french: ['le', 'la', 'les', 'et', 'est', 'que', 'des', 'une', 'pour', 'dans', 'pas', 'vous'],
  german: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'auf', 'für', 'sie'],
  portuguese: ['o', 'que', 'de', 'e', 'não', 'um', 'uma', 'para', 'com', 'os', 'é', 'você'],
  italian: ['il', 'che', 'di', 'e', 'non', 'per', 'una', 'sono', 'con', 'gli', 'della', 'è'],
  indonesian: ['yang', 'dan', 'di', 'ini', 'itu', 'dengan', 'untuk', 'tidak', 'ada', 'dari', 'saya', 'akan'],
  dutch: ['de', 'het', 'een', 'en', 'is', 'niet', 'van', 'dat', 'op', 'voor', 'met', 'je'],
}
export const LANGUAGES = [...SCRIPTS.map(([name]) => name), ...Object.keys(WORDS)]

export function languageOf(text: string): string | undefined {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  const letters = (prose.match(/\p{L}/gu) ?? []).length
  if (letters < 40) return undefined
  for (const [name, re] of SCRIPTS) if ((prose.match(re) ?? []).length > letters * 0.3) return name
  const words = prose.toLowerCase().match(/\p{L}+/gu) ?? []
  let best: string | undefined
  let bestCount = 2
  for (const [name, list] of Object.entries(WORDS)) {
    const n = words.filter(w => list.includes(w)).length
    if (n > bestCount) [best, bestCount] = [name, n]
  }
  return best
}
