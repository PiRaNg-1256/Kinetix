const STOPWORDS = new Set(
  `a an and are as at be been but by can could did do does for from had has have hey hi how i if in into is it its
  just let me my no not of on or our please so than that the their them then there these they this to too up us
  was we were what when where which who will with would you your yours i'm it's that's we're you're can't don't
  about after all also any before being both each few get got more most other out over same some such through
  under until very via want need needs still again going make sure thanks thank today tomorrow eod`.split(/\s+/),
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9'/-]*[a-z0-9]|[a-z0-9]/g) ?? []).filter(
    (t) => t.length > 2 && !STOPWORDS.has(t),
  );
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export function bigrams(text: string): Set<string> {
  const t = tokens(text);
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(`${t[i]} ${t[i + 1]}`);
  return out;
}

/** Phrases wrapped in quotes — strong identity markers ("the 'skip tour' button"). */
export function quotedPhrases(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/['‘’"“”]([^'‘’"“”\n]{3,40})['‘’"“”]/g)) {
    const phrase = m[1].trim().toLowerCase();
    // Ignore contractions captured between apostrophes ("it's done, isn't it").
    if (phrase.split(/\s+/).length <= 5 && !/^(s|t|re|ll|ve|d|m)\b/.test(phrase)) out.push(phrase);
  }
  return out;
}

export function issueKeys(text: string): string[] {
  return Array.from(new Set(text.match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) ?? []));
}

export function sentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z@'"‘“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, "") + "…";
}

export function firstName(name?: string): string {
  return (name ?? "").split(/\s+/)[0] ?? "";
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function containsAny(text: string, words: string[]): string | undefined {
  const lower = text.toLowerCase();
  return words.find((w) => lower.includes(w));
}

export function snippet(text: string, max = 180): string {
  return truncate(text.replace(/\s+/g, " ").trim(), max);
}
