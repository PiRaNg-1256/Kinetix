// Live mode exposes real inbox/Slack data, so it is locked behind KINETIX_ACCESS_KEY.
// If the key isn't set, live mode stays disabled (fail closed).

import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "kinetix_access";

export function liveAccessEnabled() {
  return Boolean(process.env.KINETIX_ACCESS_KEY && process.env.KINETIX_ACCESS_KEY.length >= 12);
}

export function tokenFor(key) {
  return createHash("sha256").update(`kinetix:${key}`).digest("hex");
}

function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkKey(candidate) {
  if (!liveAccessEnabled()) return false;
  return safeEqual(tokenFor(candidate), tokenFor(process.env.KINETIX_ACCESS_KEY));
}

export function isAuthorized(cookieValue) {
  if (!liveAccessEnabled() || !cookieValue) return false;
  return safeEqual(cookieValue, tokenFor(process.env.KINETIX_ACCESS_KEY));
}
