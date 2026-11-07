import { NextResponse } from "next/server";
import { AUTH_COOKIE, checkKey, liveAccessEnabled, tokenFor } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req) {
  if (!liveAccessEnabled()) {
    return NextResponse.json({ error: "Live mode is disabled. Set KINETIX_ACCESS_KEY (12+ characters) to enable it." }, { status: 403 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`auth:${ip}`, 10, 15 * 60_000).ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.key || !checkKey(body.key)) return NextResponse.json({ error: "Wrong access key." }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, tokenFor(body.key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
