/**
 * Every connector implements this contract. To add a tool, write one of these and register it
 * in ./index.js; the engine works on the normalized signals it returns.
 *
 * @typedef {object} Connector
 * @property {import("../types.js").SourceId} id
 * @property {string} name
 * @property {() => boolean} isConfigured True when its environment variables are set.
 * @property {string} setupHint Shown in the UI when the connector isn't configured.
 * @property {(ctx: ConnectorContext) => Promise<{ signals: import("../types.js").Signal[] }>} fetch
 */

/**
 * @typedef {object} ConnectorContext
 * @property {import("../types.js").Person} user
 * @property {Date} now
 * @property {string} timezone
 * @property {number} lookbackDays Look back this far for new context.
 * @property {(p: import("../types.js").Person) => import("../types.js").Person} classify Tags VIPs, customers and teammates (see config.js).
 */

export class ConnectorError extends Error {
  source;
  status;
  constructor(source, message, status) {
    super(message);
    this.source = source;
    this.status = status;
  }
}

export async function fetchJson(source, url, init = {}, timeoutMs = 15_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ConnectorError(source, `${res.status} ${res.statusText}: ${text.slice(0, 200)}`, res.status);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof ConnectorError) throw err;
    throw new ConnectorError(source, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Run async work with bounded concurrency (keeps us inside provider rate limits). */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
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
export function parseAddress(raw) {
  if (!raw) return { name: "Unknown" };
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2], email: m[2].trim().toLowerCase() };
  return { name: raw.trim(), email: raw.includes("@") ? raw.trim().toLowerCase() : undefined };
}

export function parseAddressList(raw) {
  if (!raw) return [];
  return raw
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map((a) => parseAddress(a).email ?? "")
    .filter(Boolean);
}

export function isoDaysAgo(now, days) {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function clip(text, max = 2500) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
