// Engine regression tests. Run with `npm test` (Node's built-in test runner, no extra deps).

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDemoWorkspace } from "../src/lib/source.ts";
import { parseDeadline } from "../src/lib/engine/deadline.ts";
import { classifyNoise } from "../src/lib/engine/noise.ts";
import { runOfflineAgent } from "../src/lib/agent/offline.ts";
import { zonedDate, zonedParts } from "../src/lib/time.ts";
import type { AgentEvent } from "../src/lib/agent/tools.ts";
import type { Signal } from "../src/lib/types.ts";

const TZ = "America/New_York";
const TUESDAY = new Date("2026-11-10T15:00:00Z");

test("noise filter drops promos, bots and social chatter but rescues direct asks", () => {
  const ws = loadDemoWorkspace(TUESDAY);
  const byTitle = (t: string) => ws.signals.find((s) => s.title.includes(t))!;
  assert.equal(byTitle("Daily Digest").noise.isNoise, true);
  assert.equal(byTitle("12 new commits").noise.isNoise, true);
  assert.equal(byTitle("Lunch & Learn").noise.isNoise, true, "declined events are noise");
  assert.equal(ws.signals.find((s) => s.channel === "#random")!.noise.isNoise, true);
  const figma = byTitle("commented on");
  assert.equal(figma.noise.isNoise, false);
  assert.match(figma.noise.reason, /rescued/);
  assert.equal(byTitle("scorecard").noise.isNoise, false, "automated mail that asks for action is kept");
  assert.ok(ws.stats.noiseFiltered >= 10 && ws.stats.noiseFiltered < ws.stats.signalsProcessed / 2);
});

test("the same ask raised in four tools becomes one task", () => {
  const ws = loadDemoWorkspace(TUESDAY);
  const skip = ws.tasks.filter((t) => /skip tour/i.test(t.title));
  assert.equal(skip.length, 1);
  assert.deepEqual([...skip[0].sources].sort(), ["gmail", "linear", "notion", "slack"]);
  assert.ok(skip[0].reasons.some((r) => r.startsWith("Raised in 4 places")));
});

test("tasks close themselves when the ticket is done or you already replied", () => {
  const ws = loadDemoWorkspace(TUESDAY);
  const closed = ws.tasks.filter((t) => t.autoClosedReason);
  assert.ok(closed.some((t) => /pricing page copy/i.test(t.title) && /replied/.test(t.autoClosedReason!)));
  assert.ok(closed.some((t) => t.title.includes("PRD-88")));
  assert.ok(closed.every((t) => t.status === "done"));
});

test("the plan is sane on every weekday (no stale deadlines, focused Now list)", () => {
  for (let day = 9; day <= 15; day++) {
    const real = new Date(Date.UTC(2026, 10, day, 15));
    const ws = loadDemoWorkspace(real);
    const now = new Date(ws.now);
    const wd = zonedParts(now, TZ).weekday;
    assert.ok(wd >= 1 && wd <= 5, "demo always lands on a weekday");
    const open = ws.tasks.filter((t) => t.status === "open");
    for (const t of open) {
      if (t.due) assert.ok(new Date(t.due).getTime() > now.getTime(), `"${t.title}" is overdue on ${real.toDateString()}`);
    }
    const focus = open.filter((t) => t.bucket === "now");
    assert.ok(focus.length >= 3 && focus.length <= 7, `Now has ${focus.length} items`);
    assert.ok(focus.some((t) => t.requester === "Sam Okafor"), "CEO ask is in Now");
    assert.ok(focus.some((t) => t.requester === "Olivia Grant"), "customer escalation is in Now");
  }
});

test("deadline parsing handles evening messages, meetings and weekends", () => {
  const meeting: Signal = {
    id: "m1",
    source: "calendar",
    kind: "event",
    title: "Atlas 2.0 Go/No-Go",
    body: "",
    author: { name: "x" },
    timestamp: zonedDate(2026, 11, 10, 15, 0, TZ).toISOString(),
    meta: { start: zonedDate(2026, 11, 10, 15, 0, TZ).toISOString() },
  };
  const now = zonedDate(2026, 11, 10, 8, 40, TZ);
  const ctx = { now, timezone: TZ, meetings: [meeting] };

  // "by 11am" written Monday evening means Tuesday 11:00.
  const eve = parseDeadline("Could you send it by 11am?", { ...ctx, sentAt: zonedDate(2026, 11, 9, 19, 5, TZ) })!;
  assert.equal(eve.iso, zonedDate(2026, 11, 10, 11, 0, TZ).toISOString());

  // "before the go/no-go" resolves to the meeting start.
  assert.equal(parseDeadline("approve it before the go/no-go", ctx)!.iso, meeting.meta.start);

  // "tomorrow" written on a Friday lands on Monday, not Saturday.
  const fri = parseDeadline("let's do it tomorrow", { ...ctx, sentAt: zonedDate(2026, 11, 6, 10, 0, TZ) })!;
  assert.equal(zonedParts(new Date(fri.iso), TZ).weekday, 1);

  // Explicit dates beat weekday names.
  const explicit = parseDeadline("upload by Friday, Nov 13", ctx)!;
  assert.equal(zonedParts(new Date(explicit.iso), TZ).day, 13);
});

test("risk radar finds the blocker, the capacity gap and the customer escalation", () => {
  const ws = loadDemoWorkspace(TUESDAY);
  const titles = ws.risks.map((r) => `${r.severity}:${r.title}`);
  assert.ok(titles.some((t) => t.startsWith("high:ATL-412 blocked")));
  assert.ok(titles.some((t) => t.startsWith("high:Marcus Bell is out")));
  assert.ok(titles.some((t) => t.startsWith("high:Brightline renewal at risk")));
  assert.ok(titles.some((t) => /ATL-415 is \d+ business days overdue/.test(t)));
  for (const r of ws.risks) assert.equal(new Set(r.evidence).size, r.evidence.length, "evidence is de-duplicated");
});

test("automated sender detection doesn't swallow real people", () => {
  const user = { name: "Jordan Lee", email: "jordan@quillon.io" };
  const s: Signal = {
    id: "x",
    source: "gmail",
    kind: "email",
    title: "Quick question",
    body: "Can you look at this?",
    author: { name: "Pat Doe", email: "pat@customer.example" },
    timestamp: TUESDAY.toISOString(),
    meta: { to: ["jordan@quillon.io"] },
  };
  assert.equal(classifyNoise(s, { user, now: TUESDAY }).isNoise, false);
});

async function ask(q: string) {
  const ws = loadDemoWorkspace(TUESDAY);
  const events: AgentEvent[] = [];
  await runOfflineAgent(ws, [{ role: "user", content: q }], (e) => events.push(e));
  const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
  return { events, text };
}

test("offline agent: meeting prep is grounded in workspace data", async () => {
  const { events, text } = await ask("Prepare me for the Brightline QBR");
  assert.ok(events.some((e) => e.type === "brief"));
  assert.match(text, /Olivia Grant/);
  assert.match(text, /\$480K/);
  assert.match(text, /ATL-415/);
});

test("offline agent: follow-up draft uses the meeting notes and is never sent", async () => {
  const { events } = await ask("Draft a follow-up for yesterday's design review");
  const draft = events.find((e) => e.type === "draft") as Extract<AgentEvent, { type: "draft" }>;
  assert.ok(draft);
  assert.equal(draft.draft.savedTo, "demo");
  assert.match(draft.draft.body, /Progressive checklist replaces the modal product tour/);
  assert.ok(draft.draft.to.includes("lena@quillon.io"));
});
