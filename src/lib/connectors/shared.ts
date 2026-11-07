import type { Person, Signal, SourceId } from "../types.ts";

export interface ConnectorContext {
  user: Person;
  now: Date;
  timezone: string;
  /** Look back this far for new context. */
  lookbackDays: number;
  /** Classify a person (VIPs, customers, teammates) from env config. */
  classify: (p: Person) => Person;
}

export interface ConnectorResult {
  signals: Signal[];
}

export interface Connector {
  id: SourceId;
  name: string;
  isConfigured: () => boolean;
  setupHint: string;
  fetch: (ctx: ConnectorContext) => Promise<ConnectorResult>;
}

export class ConnectorError extends Error {
  readonly source: SourceId;
  readonly status?: number;
  constructor(source: SourceId, message: string, status?: number) {
    super(message);
    this.source = source;
    this.status = status;
  }
}

export async function fetchJson<T>(source: SourceId, url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ConnectorError(source, `${res.status} ${res.statusText}: ${text.slice(0, 200)}`, res.status);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    throw new ConnectorError(source, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Run async work with bounded concurrency (keeps us inside provider rate limits). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** "Jane Doe <jane@x.com>" → Person */
export function parseAddress(raw: string | undefined): Person {
  if (!raw) return { name: "Unknown" };
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2], email: m[2].trim().toLowerCase() };
  return { name: raw.trim(), email: raw.includes("@") ? raw.trim().toLowerCase() : undefined };
}

export function parseAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((a) => parseAddress(a).email ?? "")
    .filter(Boolean);
}

export function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function clip(text: string, max = 2500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
