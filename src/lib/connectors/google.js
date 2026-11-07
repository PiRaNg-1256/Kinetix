// Gmail + Google Calendar via a single OAuth refresh token (see README → Connect Google).

import { ConnectorError, clip, fetchJson, isoDaysAgo, mapLimit, parseAddress, parseAddressList } from "./shared.js";

let cachedToken;

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

export async function googleAccessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetchJson("gmail", "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  cachedToken = { value: res.access_token, expires: Date.now() + res.expires_in * 1000 };
  return res.access_token;
}

// ───────────────────────────── Gmail ─────────────────────────────

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function findText(part) {
  if (!part) return undefined;
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
  for (const p of part.parts ?? []) {
    const t = findText(p);
    if (t) return t;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Url(part.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  }
  return undefined;
}

/** Drop quoted replies ("On Mon, X wrote:") so we only read the new message. */
function stripQuoted(text) {
  const cut = text.search(/\n\s*On .{5,80} wrote:\s*\n|\n-{2,}\s*Original Message|\n>{1}/);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

export const gmailConnector = {
  id: "gmail",
  name: "Gmail",
  isConfigured: googleConfigured,
  setupHint:
    "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (scopes: gmail.readonly, gmail.compose, calendar.readonly).",
  async fetch(ctx) {
    const token = await googleAccessToken();
    const headers = { Authorization: `Bearer ${token}` };
    const q = encodeURIComponent(`newer_than:${ctx.lookbackDays}d -in:chats`);
    const list = await fetchJson("gmail", `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=60&q=${q}`, { headers });
    const msgs = await mapLimit(list.messages ?? [], 8, (m) =>
      fetchJson("gmail", `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers }),
    );
    const signals = msgs.map((m) => {
      const h = Object.fromEntries((m.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]));
      const author = ctx.classify(parseAddress(h.from));
      const labels = m.labelIds ?? [];
      const text = stripQuoted(findText(m.payload) ?? m.snippet ?? "");
      return {
        id: `gmail-${m.id}`,
        source: "gmail",
        kind: "email",
        title: h.subject ?? "(no subject)",
        body: clip(text),
        author,
        timestamp: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
        url: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
        threadId: `gmail-thread-${m.threadId}`,
        channel: labels.includes("SENT") ? "Sent" : "Inbox",
        meta: {
          unread: labels.includes("UNREAD"),
          labels,
          listUnsubscribe: Boolean(h["list-unsubscribe"]),
          to: parseAddressList(h.to),
          cc: parseAddressList(h.cc),
        },
      };
    });
    return { signals };
  },
};

/** Save a draft in the user's Gmail (never sends). */
export async function createGmailDraft(draft) {
  const token = await googleAccessToken();
  const raw = [
    `To: ${draft.to.join(", ")}`,
    draft.cc?.length ? `Cc: ${draft.cc.join(", ")}` : "",
    `Subject: ${draft.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    draft.body,
  ]
    .filter((l, i) => l !== "" || i > 2)
    .join("\r\n");
  const encoded = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetchJson("gmail", "https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw: encoded } }),
  });
  return res.id;
}

// ──────────────────────────── Calendar ────────────────────────────

export const calendarConnector = {
  id: "calendar",
  name: "Google Calendar",
  isConfigured: googleConfigured,
  setupHint: "Uses the same Google credentials as Gmail.",
  async fetch(ctx) {
    const token = await googleAccessToken();
    const params = new URLSearchParams({
      timeMin: isoDaysAgo(ctx.now, 1),
      timeMax: new Date(ctx.now.getTime() + 7 * 86_400_000).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "80",
    });
    const res = await fetchJson("calendar", `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const nameOf = (a) => (a.self ? ctx.user.name : (a.displayName ?? a.email ?? "Unknown"));
    const signals = (res.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .map((e) => {
        const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : ctx.now.toISOString());
        const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00Z` : undefined);
        const self = e.attendees?.find((a) => a.self);
        const organizer = e.organizer ? ctx.classify({ name: nameOf(e.organizer), email: e.organizer.email }) : ctx.user;
        return {
          id: `calendar-${e.id}`,
          source: "calendar",
          kind: "event",
          title: e.summary ?? "(untitled event)",
          body: clip((e.description ?? "").replace(/<[^>]+>/g, " "), 1500),
          author: organizer,
          timestamp: start,
          url: e.htmlLink,
          meta: {
            start,
            end,
            organizer: organizer.name,
            attendees: (e.attendees ?? []).map(nameOf),
            location: e.location,
            responseStatus: self?.responseStatus ?? (e.organizer?.self ? "accepted" : undefined),
            isOutOfOffice: e.eventType === "outOfOffice",
          },
        };
      });
    return { signals };
  },
};

export { ConnectorError };
