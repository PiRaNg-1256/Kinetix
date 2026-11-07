// Live mode exposes real inbox/Slack data, so it is locked behind KINETIX_ACCESS_KEY.
// If the key isn't set, live mode stays disabled (fail closed).

import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "kinetix_access";

export function liveAccessEnabled(): boolean {
  return Boolean(process.env.KINETIX_ACCESS_KEY && process.env.KINETIX_ACCESS_KEY.length >= 12);
}

export function tokenFor(key: string): string {
  return createHash("sha256").update(`kinetix:${key}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkKey(candidate: string): boolean {
  if (!liveAccessEnabled()) return false;
  return safeEqual(tokenFor(candidate), tokenFor(process.env.KINETIX_ACCESS_KEY!));
}

export function isAuthorized(cookieValue: string | undefined): boolean {
  if (!liveAccessEnabled() || !cookieValue) return false;
  return safeEqual(cookieValue, tokenFor(process.env.KINETIX_ACCESS_KEY!));
}
