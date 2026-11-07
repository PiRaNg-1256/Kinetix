// Small in-memory sliding-window limiter. Per serverless instance, so it is a speed bump for
// the public demo rather than a hard guarantee — set KINETIX_DEMO_USE_CLAUDE=false to make the
// demo fully offline if you need zero API spend.

const hits = new Map();

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t > windowMs)) hits.delete(k);
  return { ok: true, retryAfter: 0 };
}
