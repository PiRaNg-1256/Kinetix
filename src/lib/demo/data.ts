// A fictional company and a realistic morning of inbound context, used by the public demo.
// Everything is generated relative to a frozen "now" (08:40 on the current business day in
// New York) so the scenario always reads as a fresh morning briefing.
//
// Quillon, its people and its customers are invented. Any resemblance to real companies is
// unintentional.

import type { Person, Project, Signal, SourceId, SignalKind, SignalMeta } from "../types.ts";
import { addBusinessDays, weekdayName, zonedDate, zonedParts } from "../time.ts";

export const DEMO_TZ = "America/New_York";

export interface RawWorkspace {
  now: Date;
  timezone: string;
  user: Person;
  people: Person[];
  projects: Project[];
  signals: Signal[];
}

export function demoNow(real: Date = new Date()): Date {
  const p = zonedParts(real, DEMO_TZ);
  let { year: y, month: m, day: d } = p;
  // Weekend visitors get Monday's briefing.
  if (p.weekday === 6 || p.weekday === 0) {
    const next = addBusinessDays(y, m, d, 1);
    y = next.y;
    m = next.m;
    d = next.d;
  }
  return zonedDate(y, m, d, 8, 40, DEMO_TZ);
}

export function buildDemoWorkspace(real: Date = new Date()): RawWorkspace {
  const now = demoNow(real);
  const p = zonedParts(now, DEMO_TZ);

  /** ISO timestamp for business-day offset `bd` at hh:mm New York time. */
  const at = (bd: number, hh: number, mm = 0): string => {
    const t = addBusinessDays(p.year, p.month, p.day, bd);
    return zonedDate(t.y, t.m, t.d, hh, mm, DEMO_TZ).toISOString();
  };
  /** Weekday name for business-day offset `bd`. */
  const day = (bd: number): string => weekdayName(addBusinessDays(p.year, p.month, p.day, bd).weekday);
  const dateLabel = (bd: number): string => {
    const t = addBusinessDays(p.year, p.month, p.day, bd);
    return new Date(Date.UTC(t.y, t.m - 1, t.d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };

  const user: Person = {
    name: "Jordan Lee",
    email: "jordan@quillon.io",
    handle: "jordan",
    role: "Head of Product",
    relationship: "self",
    weight: 1,
  };

  const P = {
    sam: { name: "Sam Okafor", email: "sam@quillon.io", handle: "sam", role: "CEO", relationship: "exec", weight: 1 },
    dana: { name: "Dana Whitfield", email: "dana@quillon.io", handle: "dana", role: "CFO", relationship: "exec", weight: 0.95 },
    ethan: { name: "Ethan Brooks", email: "ethan@quillon.io", handle: "ethan", role: "VP Engineering", relationship: "exec", weight: 0.9 },
    priya: { name: "Priya Raman", email: "priya@quillon.io", handle: "priya", role: "Engineering Manager, Atlas", relationship: "peer", weight: 0.75 },
    marcus: { name: "Marcus Bell", email: "marcus@quillon.io", handle: "marcus", role: "Senior Engineer, Payments", relationship: "peer", weight: 0.6 },
    wei: { name: "Wei Zhang", email: "wei@quillon.io", handle: "wei", role: "Software Engineer, Identity", relationship: "peer", weight: 0.5 },
    lena: { name: "Lena Fischer", email: "lena@quillon.io", handle: "lena", role: "Product Designer", relationship: "report", weight: 0.7 },
    tomas: { name: "Tomás Alvarez", email: "tomas@quillon.io", handle: "tomas", role: "Product Manager, Atlas", relationship: "report", weight: 0.75 },
    mia: { name: "Mia Torres", email: "mia@quillon.io", handle: "mia", role: "Data Analyst", relationship: "peer", weight: 0.5 },
    rachel: { name: "Rachel Kim", email: "rachel@quillon.io", handle: "rachel", role: "Customer Success Lead", relationship: "peer", weight: 0.75 },
    ava: { name: "Ava Morgan", email: "ava@quillon.io", handle: "ava", role: "Product Marketing Manager", relationship: "peer", weight: 0.55 },
    olivia: { name: "Olivia Grant", email: "olivia.grant@brightline-logistics.example", role: "Director of Operations, Brightline Logistics", relationship: "customer", weight: 0.95 },
    kenji: { name: "Kenji Watanabe", email: "kenji.w@brightline-logistics.example", role: "IT Lead, Brightline Logistics", relationship: "customer", weight: 0.85 },
    nora: { name: "Nora Patel", email: "nora@vantage-audit.example", role: "Senior Auditor, Vantage Audit", relationship: "partner", weight: 0.65 },
  } satisfies Record<string, Person>;

  const bot = (name: string, email: string): Person => ({ name, email, relationship: "automated", weight: 0 });

  const people: Person[] = [user, ...Object.values(P)];

  const projects: Project[] = [
    {
      id: "atlas",
      name: "Atlas 2.0 launch",
      description: `GA launch of the new workflow builder, targeted for ${day(7)} ${dateLabel(7)}. Launch freeze starts ${day(4)} 9am.`,
      targetDate: at(7, 10),
      owner: user.name,
      criticality: 1,
      keywords: ["atlas", "launch", "ga", "go/no-go", "workflow builder", "payments migration", "ledger", "atl-", "onboarding", "skip tour", "freeze", "rollback"],
    },
    {
      id: "brightline",
      name: "Brightline renewal",
      description: `Brightline Logistics — $480K ARR enterprise account, renewal due ${dateLabel(12)}. Health: red after repeated SSO incidents.`,
      targetDate: at(12, 17),
      owner: P.rachel.name,
      criticality: 0.9,
      keywords: ["brightline", "renewal", "sso", "saml", "qbr", "okta", "olivia", "kenji", "audit log"],
    },
    {
      id: "board",
      name: "Q4 board meeting",
      description: `Board meeting ${day(8)} ${dateLabel(8)}. Deck due to Sam ${day(3)}.`,
      targetDate: at(8, 9),
      owner: P.dana.name,
      criticality: 0.8,
      keywords: ["board", "deck", "product section", "activation", "funnel", "metrics", "arr"],
    },
    {
      id: "soc2",
      name: "SOC 2 Type II audit",
      description: `Auditor fieldwork closes ${day(4)} ${dateLabel(4)}. Missing evidence becomes a reported exception.`,
      targetDate: at(4, 17),
      owner: P.ethan.name,
      criticality: 0.6,
      keywords: ["soc 2", "soc2", "audit", "evidence", "access review", "change-management", "vantage"],
    },
  ];

  let n = 0;
  const sig = (
    source: SourceId,
    kind: SignalKind,
    fields: Omit<Signal, "id" | "source" | "kind" | "meta"> & { meta?: SignalMeta; id?: string },
  ): Signal => ({
    id: fields.id ?? `${source}-${++n}`,
    source,
    kind,
    ...fields,
    meta: fields.meta ?? {},
  });

  const me = user.email!;
  const signals: Signal[] = [
    // ───────────────────────────── Gmail ─────────────────────────────
    sig("gmail", "email", {
      id: "gmail-olivia-sso",
      title: "SSO issues ahead of our QBR",
      author: P.olivia,
      timestamp: at(-1, 18, 12),
      threadId: "t-olivia-sso",
      projectId: "brightline",
      channel: "Inbox",
      body: `Hi Jordan, Rachel,\n\nI want to flag before our QBR that my team hit the SSO login loop again this morning. That's the third time this month — 40+ dispatchers were locked out for about an hour.\n\nHonestly, my leadership is starting to ask whether we should reconsider the renewal. Can you come to the QBR with a clear root cause and a date for the fix? We also still need the SAML audit log export we were promised back in Q3.\n\nThanks,\nOlivia`,
      meta: { unread: true, to: [me, P.rachel.email], labels: ["INBOX", "IMPORTANT"] },
    }),
    sig("gmail", "email", {
      id: "gmail-rachel-renewal",
      title: "Brightline renewal — where we stand",
      author: P.rachel,
      timestamp: at(-1, 19, 5),
      threadId: "t-rachel-renewal",
      projectId: "brightline",
      channel: "Inbox",
      body: `Jordan — quick read before the QBR. Renewal is $480K ARR and due in about three weeks. Olivia's team also sat through a Flowstack demo last week, so they are actively shopping.\n\nWhat would land best: a committed date for the SSO fix (ATL-398), an owner and date for the audit log export, and a credible look at Atlas 2.0. Could you send me the roadmap slide by 11am so I can fold it into the QBR deck?\n\nThanks — Rachel`,
      meta: { unread: true, to: [me], labels: ["INBOX"] },
    }),
    sig("gmail", "email", {
      id: "gmail-dana-board",
      title: "Board deck — product section",
      author: P.dana,
      timestamp: at(-1, 16, 40),
      threadId: "t-board-deck",
      projectId: "board",
      channel: "Inbox",
      body: `Hi Jordan,\n\nThe board deck is due to Sam on ${day(3)}. Please send me your product section — Atlas launch status, Q4 roadmap and the activation metrics — by ${day(2)} EOD so I can reconcile the numbers with finance. The new template is in Notion.\n\nThanks!\nDana`,
      meta: { unread: false, to: [me], labels: ["INBOX"] },
    }),
    sig("gmail", "email", {
      id: "gmail-sam-gonogo",
      title: "Go/No-Go: payments migration + rollback plan",
      author: P.sam,
      timestamp: at(0, 7, 30),
      threadId: "t-sam-gonogo",
      projectId: "atlas",
      channel: "Inbox",
      body: `Jordan — for this afternoon's go/no-go I want straight answers on two things. Is the payments migration going to make the launch date? And what is our rollback plan if it doesn't? If we're not confident I'd rather slip a week than launch something broken.\n\n— Sam`,
      meta: { unread: true, to: [me], labels: ["INBOX", "IMPORTANT"] },
    }),
    sig("gmail", "email", {
      id: "gmail-nora-soc2",
      title: "SOC 2 Type II — outstanding evidence",
      author: P.nora,
      timestamp: at(-2, 10, 15),
      threadId: "t-soc2",
      projectId: "soc2",
      channel: "Inbox",
      body: `Hi Jordan,\n\nFollowing up on the evidence request list. We are still missing (1) the Q3 user access review sign-off for the product admin console and (2) the change-management tickets for the Atlas release pipeline.\n\nOur fieldwork window closes ${day(4)}. Could you upload the Q3 access review sign-off and the change-management tickets to the portal by ${day(4)}, ${dateLabel(4)}? Otherwise we will have to note an exception.\n\nBest,\nNora Patel\nVantage Audit`,
      meta: { unread: false, to: [me], cc: [P.ethan.email], labels: ["INBOX"] },
    }),
    sig("gmail", "email", {
      id: "gmail-nora-soc2-reminder",
      title: "Re: SOC 2 Type II — outstanding evidence",
      author: P.nora,
      timestamp: at(0, 7, 55),
      threadId: "t-soc2",
      projectId: "soc2",
      channel: "Inbox",
      body: `Gentle reminder on the above — we still need the access review sign-off and the change tickets. Can you confirm you're on track for ${day(4)}, ${dateLabel(4)}?\n\nNora`,
      meta: { unread: true, to: [me], cc: [P.ethan.email], labels: ["INBOX"] },
    }),
    sig("gmail", "email", {
      id: "gmail-kenji-auditlog",
      title: "SAML audit log export — ETA?",
      author: P.kenji,
      timestamp: at(-3, 9, 0),
      threadId: "t-kenji-auditlog",
      projectId: "brightline",
      channel: "Inbox",
      body: `Hi Rachel, Jordan,\n\nOur internal compliance review is blocked until we get the SAML audit log export that was scoped for Q3. Is there an ETA we can share with our security team?\n\nThanks,\nKenji`,
      meta: { unread: false, to: [P.rachel.email], cc: [me], labels: ["INBOX"] },
    }),
    sig("gmail", "email", {
      id: "gmail-ava-claims",
      title: "Atlas launch campaign — assets ready for review",
      author: P.ava,
      timestamp: at(-1, 11, 20),
      threadId: "t-ava-launch",
      projectId: "atlas",
      channel: "Inbox",
      body: `Hi Jordan,\n\nThe launch blog post and press release drafts are in the shared drive. Please review the product claims in the launch blog post by ${day(1)} so legal can sign off.\n\nAva`,
      meta: { unread: false, to: [me], labels: ["INBOX"] },
    }),
    sig("gmail", "email", {
      id: "gmail-ava-pricing",
      title: "Final pricing page copy",
      author: P.ava,
      timestamp: at(-3, 10, 0),
      threadId: "t-pricing",
      projectId: "atlas",
      channel: "Inbox",
      body: `Hey Jordan — can you send the final pricing page copy by ${day(-1)} so we can stage it? Thanks!`,
      meta: { unread: false, to: [me], labels: ["INBOX"] },
    }),
    sig("gmail", "email", {
      id: "gmail-jordan-pricing-reply",
      title: "Re: Final pricing page copy",
      author: user,
      timestamp: at(-1, 16, 0),
      threadId: "t-pricing",
      projectId: "atlas",
      channel: "Sent",
      body: `Sent over the final copy — it's in the doc. Let me know if legal flags anything.`,
      meta: { to: [P.ava.email], labels: ["SENT"] },
    }),
    sig("gmail", "email", {
      id: "gmail-figma-skiptour",
      title: "Lena Fischer commented on “Atlas Onboarding v3”",
      author: bot("Figma", "no-reply@figma.com"),
      timestamp: at(-1, 15, 44),
      projectId: "atlas",
      channel: "Updates",
      body: `Lena Fischer: @Jordan can you confirm we're dropping the 'skip tour' button? Need a decision before handoff to engineering.\n\nReply in Figma · Unsubscribe from comment notifications`,
      meta: { unread: true, to: [me], labels: ["CATEGORY_UPDATES"], listUnsubscribe: true },
    }),
    sig("gmail", "email", {
      id: "gmail-greenhouse",
      title: "Action required: scorecard for Alex Chen (Senior PM)",
      author: bot("Greenhouse", "no-reply@greenhouse.example"),
      timestamp: at(-1, 17, 30),
      channel: "Updates",
      body: `Please submit your scorecard for Alex Chen (Senior Product Manager), who you interviewed yesterday. Scorecards are due within 48 hours of the interview.`,
      meta: { unread: true, to: [me], labels: ["CATEGORY_UPDATES"] },
    }),
    sig("gmail", "email", {
      title: "[quillon/atlas] 12 new commits pushed to main",
      author: bot("GitHub", "notifications@github.com"),
      timestamp: at(0, 6, 2),
      channel: "Updates",
      body: `12 new commits by priya-r, wzhang and 3 others. View the comparison on GitHub. You are receiving this because you are watching this repository.`,
      meta: { unread: true, to: [me], labels: ["CATEGORY_UPDATES"], listUnsubscribe: true },
    }),
    sig("gmail", "email", {
      title: "The Daily Digest: 5 AI tools that will change how you work",
      author: bot("Product Hunt", "hello@digest.producthunt.example"),
      timestamp: at(0, 5, 30),
      channel: "Promotions",
      body: `Today's top launches, curated for you. Unsubscribe · Manage preferences`,
      meta: { unread: true, labels: ["CATEGORY_PROMOTIONS"], listUnsubscribe: true },
    }),
    sig("gmail", "email", {
      title: "You appeared in 14 searches this week",
      author: bot("LinkedIn", "notifications-noreply@linkedin.example"),
      timestamp: at(-1, 21, 0),
      channel: "Social",
      body: `See who's looking at your profile. Upgrade to Premium.`,
      meta: { unread: true, labels: ["CATEGORY_SOCIAL"], listUnsubscribe: true },
    }),
    sig("gmail", "email", {
      title: "Your expense report “October travel” was approved",
      author: bot("Expensify", "concierge@expensify.example"),
      timestamp: at(-1, 13, 10),
      channel: "Updates",
      body: `Your report has been approved and will be reimbursed in the next payroll cycle. No action needed.`,
      meta: { labels: ["CATEGORY_UPDATES"] },
    }),
    sig("gmail", "email", {
      title: "Cloud recording available: Atlas onboarding design review",
      author: bot("Zoom", "no-reply@zoom.example"),
      timestamp: at(-1, 15, 20),
      channel: "Updates",
      body: `Your cloud recording is now available. Share it with your team.`,
      meta: { labels: ["CATEGORY_UPDATES"], listUnsubscribe: true },
    }),
    sig("gmail", "email", {
      title: "Your weekly Notion digest",
      author: bot("Notion", "notify@mail.notion.example"),
      timestamp: at(0, 6, 45),
      channel: "Updates",
      body: `38 pages were updated in Quillon this week. Here's what changed.`,
      meta: { labels: ["CATEGORY_UPDATES"], listUnsubscribe: true },
    }),

    // ───────────────────────────── Slack ─────────────────────────────
    sig("slack", "message", {
      id: "slack-priya-blocked",
      title: "#atlas-launch",
      author: P.priya,
      timestamp: at(-1, 17, 20),
      channel: "#atlas-launch",
      projectId: "atlas",
      body: `Heads up: ATL-412 (payments migration to the new ledger service) is still blocked on the vendor's sandbox credentials. Marcus has been waiting since last week. If we don't have creds by ${day(0)} we can't finish load testing before the launch freeze.`,
    }),
    sig("slack", "message", {
      id: "slack-marcus-ooo",
      title: "DM with Marcus Bell",
      author: P.marcus,
      timestamp: at(-1, 18, 2),
      channel: "DM",
      threadId: "dm-marcus",
      projectId: "atlas",
      body: `hey Jordan, reminder that I'm out from ${day(2)} through ${day(6)} (wedding 🎉). I'm the only one who has touched the ledger integration — can we get someone paired with me on ${day(0)} so the migration isn't stuck while I'm gone?`,
      meta: { isDM: true },
    }),
    sig("slack", "message", {
      id: "slack-tomas-scope",
      title: "DM with Tomás Alvarez",
      author: P.tomas,
      timestamp: at(0, 8, 5),
      channel: "DM",
      threadId: "dm-tomas",
      projectId: "atlas",
      body: `Morning! Can you approve the final GA scope doc before the go/no-go? I need your sign-off so I can share it with Sam and Ethan.`,
      meta: { isDM: true },
    }),
    sig("slack", "message", {
      id: "slack-lena-skiptour",
      title: "#atlas-launch",
      author: P.lena,
      timestamp: at(-1, 15, 40),
      channel: "#atlas-launch",
      projectId: "atlas",
      body: `@jordan design QA for onboarding v3 is done except the empty states. I need a call on whether the 'skip tour' button stays. Figma link in thread.`,
      meta: { mentionsMe: true },
    }),
    sig("slack", "message", {
      id: "slack-rachel-escalation",
      title: "#customer-escalations",
      author: P.rachel,
      timestamp: at(-1, 10, 5),
      channel: "#customer-escalations",
      projectId: "brightline",
      body: `Brightline hit the SSO login loop again this morning — 40 users locked out for ~1hr. Eng ticket is ATL-398. This is now the #1 risk to the renewal.`,
    }),
    sig("slack", "message", {
      title: "#eng-platform",
      author: P.ethan,
      timestamp: at(-1, 12, 0),
      channel: "#eng-platform",
      projectId: "atlas",
      body: `Reminder: the Atlas launch freeze starts ${day(4)} 9am ET. Anything not merged by then ships in 2.0.1.`,
    }),
    sig("slack", "message", {
      id: "slack-dana-funnel",
      title: "DM with Dana Whitfield",
      author: P.dana,
      timestamp: at(0, 8, 20),
      channel: "DM",
      threadId: "t-board-deck",
      projectId: "board",
      body: `also — can you include the activation funnel numbers in the product section? The board asked for them last time.`,
      meta: { isDM: true },
    }),
    sig("slack", "message", {
      title: "#atlas-launch",
      author: P.priya,
      timestamp: at(-1, 9, 10),
      channel: "#atlas-launch",
      projectId: "atlas",
      body: `Update: load-test environment is ready. ATL-405 done ✅`,
    }),
    sig("slack", "message", {
      title: "#product",
      author: P.tomas,
      timestamp: at(-1, 16, 30),
      channel: "#product",
      body: `Weekly product sync notes are posted in Notion. Nothing blocking from the growth pod this week.`,
    }),
    sig("slack", "message", {
      title: "#atlas-launch",
      author: bot("GitHub", "github-bot"),
      timestamp: at(0, 6, 5),
      channel: "#atlas-launch",
      body: `✅ Build #4821 passed on main (atlas-web) — 1,284 tests, 6m 12s`,
    }),
    sig("slack", "message", {
      title: "#general",
      author: P.ava,
      timestamp: at(-1, 12, 30),
      channel: "#general",
      body: `🍕 Pizza in the kitchen for the Q3 celebration! Come grab a slice.`,
    }),
    sig("slack", "message", {
      title: "#random",
      author: P.wei,
      timestamp: at(-1, 17, 45),
      channel: "#random",
      body: `anyone watching the game tonight?`,
    }),
    sig("slack", "message", {
      title: "#social",
      author: bot("Slackbot", "slackbot"),
      timestamp: at(0, 8, 0),
      channel: "#social",
      body: `Please welcome our new design intern, Jamie! 👋`,
    }),

    // ──────────────────────────── Calendar ────────────────────────────
    sig("calendar", "event", {
      id: "cal-standup",
      title: "Atlas daily standup",
      author: P.tomas,
      timestamp: at(0, 9, 30),
      projectId: "atlas",
      body: `Recurring daily standup for the Atlas 2.0 team.`,
      meta: {
        start: at(0, 9, 30),
        end: at(0, 9, 45),
        organizer: P.tomas.name,
        attendees: [P.tomas.name, P.priya.name, P.marcus.name, P.lena.name, user.name],
        responseStatus: "accepted",
        location: "Zoom",
      },
    }),
    sig("calendar", "event", {
      id: "cal-focus",
      title: "Focus time",
      author: user,
      timestamp: at(0, 10, 0),
      body: `Blocked for deep work.`,
      meta: { start: at(0, 10, 0), end: at(0, 11, 0), organizer: user.name, attendees: [user.name], responseStatus: "accepted" },
    }),
    sig("calendar", "event", {
      title: "Lunch & Learn: Prompt engineering 101",
      author: P.ava,
      timestamp: at(0, 12, 0),
      body: `Optional session in the big conference room.`,
      meta: { start: at(0, 12, 0), end: at(0, 12, 45), organizer: P.ava.name, attendees: [P.ava.name, user.name], responseStatus: "declined" },
    }),
    sig("calendar", "event", {
      id: "cal-qbr",
      title: "Brightline × Quillon — Quarterly Business Review",
      author: P.rachel,
      timestamp: at(0, 13, 0),
      projectId: "brightline",
      body: `Agenda:\n1) Platform reliability & SSO incidents\n2) Q4 roadmap and Atlas 2.0\n3) Renewal timeline`,
      meta: {
        start: at(0, 13, 0),
        end: at(0, 14, 0),
        organizer: P.rachel.name,
        attendees: [P.olivia.name, P.kenji.name, P.rachel.name, user.name],
        responseStatus: "accepted",
        location: "Google Meet",
      },
    }),
    sig("calendar", "event", {
      id: "cal-gonogo",
      title: "Atlas 2.0 Go/No-Go",
      author: user,
      timestamp: at(0, 15, 0),
      projectId: "atlas",
      body: `Decide whether Atlas 2.0 GA ships on ${day(7)} ${dateLabel(7)}.\nInputs: GA scope doc, launch readiness checklist, payments migration status, rollback plan.`,
      meta: {
        start: at(0, 15, 0),
        end: at(0, 16, 0),
        organizer: user.name,
        attendees: [P.sam.name, P.ethan.name, P.priya.name, P.tomas.name, P.lena.name, user.name],
        responseStatus: "accepted",
        location: "Boardroom / Zoom",
      },
    }),
    sig("calendar", "event", {
      id: "cal-1on1-tomas",
      title: "1:1 Jordan / Tomás",
      author: user,
      timestamp: at(0, 16, 30),
      body: `Weekly 1:1.`,
      meta: { start: at(0, 16, 30), end: at(0, 17, 0), organizer: user.name, attendees: [user.name, P.tomas.name], responseStatus: "accepted" },
    }),
    sig("calendar", "event", {
      id: "cal-board-review",
      title: "Board deck review",
      author: P.dana,
      timestamp: at(1, 10, 0),
      projectId: "board",
      body: `Walk through the Q4 board deck draft before it goes to Sam.`,
      meta: {
        start: at(1, 10, 0),
        end: at(1, 11, 0),
        organizer: P.dana.name,
        attendees: [P.dana.name, P.sam.name, user.name],
        responseStatus: "accepted",
      },
    }),
    sig("calendar", "event", {
      id: "cal-marcus-ooo",
      title: "Marcus Bell — Out of office",
      author: P.marcus,
      timestamp: at(2, 0, 0),
      body: `Out of office (wedding). Back ${day(7)}.`,
      meta: { start: at(2, 0, 0), end: at(7, 0, 0), organizer: P.marcus.name, attendees: [P.marcus.name], isOutOfOffice: true },
    }),
    sig("calendar", "event", {
      id: "cal-design-review",
      title: "Atlas onboarding design review",
      author: P.lena,
      timestamp: at(-1, 14, 0),
      projectId: "atlas",
      body: `Review onboarding v3 flows before engineering handoff.`,
      meta: {
        start: at(-1, 14, 0),
        end: at(-1, 15, 0),
        organizer: P.lena.name,
        attendees: [P.lena.name, P.tomas.name, P.priya.name, user.name],
        responseStatus: "accepted",
      },
    }),

    // ───────────────────────────── Notion ─────────────────────────────
    sig("notion", "doc", {
      id: "notion-ga-scope",
      title: "Atlas 2.0 — GA scope (v4)",
      author: P.tomas,
      timestamp: at(0, 7, 50),
      channel: "Product / Atlas",
      projectId: "atlas",
      body: `Status: awaiting Jordan's approval\n\nIn scope for GA: visual workflow builder, template gallery, progressive onboarding checklist, usage-based billing on the new ledger service.\nOut of scope (2.0.1): workflow versioning, custom roles.\n\nOpen questions:\n- 'Skip tour' button: keep or remove? (decision owner: Jordan)\n- Usage-based billing depends on the payments migration (ATL-412).`,
      meta: { lastEditedBy: P.tomas.name },
    }),
    sig("notion", "doc", {
      id: "notion-design-notes",
      title: `Design review notes — Atlas onboarding (${dateLabel(-1)})`,
      author: P.lena,
      timestamp: at(-1, 15, 10),
      channel: "Design / Reviews",
      projectId: "atlas",
      body: `Attendees: Lena, Tomás, Priya, Jordan\n\nDecisions\n- Progressive checklist replaces the modal product tour.\n- Template gallery moves to step 2 of onboarding.\n- Empty states get illustrated placeholders (no stock imagery).\n\nAction items\n- Lena — finalize empty states by ${day(2)}\n- Tomás — update the GA scope doc with the checklist change\n- Priya — estimate analytics events for the checklist\n- Jordan — decide on the 'skip tour' button by ${day(1)}\n- Jordan — send a recap to stakeholders`,
      meta: { lastEditedBy: P.lena.name },
    }),
    sig("notion", "doc", {
      id: "notion-readiness",
      title: "Launch readiness checklist — Atlas 2.0",
      author: P.priya,
      timestamp: at(-1, 18, 30),
      channel: "Engineering / Atlas",
      projectId: "atlas",
      body: `- Security review ✅ done\n- Docs & help center ✅ done\n- Status page & alerts ✅ done\n- Support training ⏳ scheduled ${day(3)}\n- Load testing ⚠️ blocked on ATL-412 (ledger sandbox creds)\n- Rollback plan ❌ not written (ATL-420)`,
      meta: { lastEditedBy: P.priya.name },
    }),
    sig("notion", "doc", {
      id: "notion-account-plan",
      title: "Brightline Logistics — account plan",
      author: P.rachel,
      timestamp: at(-2, 14, 0),
      channel: "Customers / Enterprise",
      projectId: "brightline",
      body: `ARR: $480K · Renewal: ${dateLabel(12)} · Health: 🔴 red\n\nStakeholders: Olivia Grant (economic buyer), Kenji Watanabe (IT / security)\n\nHistory: three SSO login-loop incidents in the last month. SAML audit log export was committed for Q3 and slipped. Evaluating Flowstack as an alternative.\n\nWhat they value: reliability for 300 dispatchers, audit/compliance features, Atlas templates for their routing workflows.`,
      meta: { lastEditedBy: P.rachel.name },
    }),
    sig("notion", "doc", {
      id: "notion-board-template",
      title: "Q4 board deck — template",
      author: P.dana,
      timestamp: at(-2, 11, 0),
      channel: "Finance / Board",
      projectId: "board",
      body: `Sections: 1) Company metrics (Dana) 2) Product: launch status, roadmap, activation funnel (Jordan) 3) GTM (Sam) 4) Hiring plan.`,
      meta: { lastEditedBy: P.dana.name },
    }),
    sig("notion", "doc", {
      title: "Team directory",
      author: bot("Notion AI", "notion-bot"),
      timestamp: at(0, 3, 0),
      channel: "Company",
      body: `Automatically synced from the HRIS. 2 profiles updated.`,
      meta: { isBotEdit: true, lastEditedBy: "Notion AI" },
    }),

    // ────────────────────────────── Jira ──────────────────────────────
    sig("jira", "issue", {
      id: "jira-atl-412",
      title: "ATL-412 Migrate payments to the new ledger service",
      author: P.priya,
      timestamp: at(-1, 17, 25),
      channel: "ATL",
      projectId: "atlas",
      body: `Blocked: waiting on LedgerCo sandbox credentials (vendor ticket #88213). Required for load testing before the launch freeze. Marcus is the only engineer with context on the ledger integration.`,
      meta: { key: "ATL-412", status: "Blocked", priority: "urgent", assignee: P.marcus.name, reporter: P.priya.name, dueDate: at(4, 9), statusSince: at(-4, 11) },
    }),
    sig("jira", "issue", {
      id: "jira-atl-398",
      title: "ATL-398 SSO login loop for Okta SAML users (Brightline)",
      author: P.wei,
      timestamp: at(-1, 11, 40),
      channel: "ATL",
      projectId: "brightline",
      body: `Root cause suspected: the SameSite cookie change in 1.9.3 breaks the IdP-initiated SAML flow on Okta. Fix is in code review; needs QA on a test Okta tenant before release. Customer: Brightline Logistics.`,
      meta: { key: "ATL-398", status: "In Review", priority: "high", assignee: P.wei.name, reporter: P.rachel.name, statusSince: at(-1, 11, 40) },
    }),
    sig("jira", "issue", {
      id: "jira-atl-415",
      title: "ATL-415 SAML audit log export",
      author: P.rachel,
      timestamp: at(-6, 10, 0),
      channel: "ATL",
      projectId: "brightline",
      body: `Customer commitment (Brightline) for Q3. Export SAML authentication events as CSV / via API.`,
      meta: { key: "ATL-415", status: "To Do", priority: "medium", assignee: P.wei.name, reporter: P.rachel.name, dueDate: at(-15, 17), statusSince: at(-30, 10) },
    }),
    sig("jira", "issue", {
      id: "jira-atl-420",
      title: "ATL-420 Write rollback runbook for Atlas 2.0",
      author: P.ethan,
      timestamp: at(-2, 9, 0),
      channel: "ATL",
      projectId: "atlas",
      body: `Runbook covering feature-flag rollback, ledger dual-write fallback and customer comms. Required for go/no-go.`,
      meta: { key: "ATL-420", status: "To Do", priority: "high", assignee: P.priya.name, reporter: P.ethan.name, dueDate: at(0, 14), statusSince: at(-2, 9) },
    }),
    sig("jira", "issue", {
      id: "jira-atl-399",
      title: "ATL-399 Export change-management evidence for SOC 2",
      author: P.ethan,
      timestamp: at(-5, 9, 0),
      channel: "ATL",
      projectId: "soc2",
      body: `Pull the change tickets for the Atlas release pipeline (Q3) and upload them to the Vantage portal.`,
      meta: { key: "ATL-399", status: "To Do", priority: "medium", assignee: user.name, reporter: P.ethan.name, dueDate: at(4, 12), statusSince: at(-5, 9) },
    }),
    sig("jira", "issue", {
      title: "ATL-405 Provision load-test environment",
      author: P.priya,
      timestamp: at(-1, 9, 8),
      channel: "ATL",
      projectId: "atlas",
      body: `Environment provisioned and smoke-tested.`,
      meta: { key: "ATL-405", status: "Done", priority: "high", assignee: P.priya.name, reporter: user.name, statusSince: at(-1, 9, 8) },
    }),
    sig("jira", "issue", {
      title: "ATL-431 Typo in tooltip on builder step 3",
      author: P.wei,
      timestamp: at(-1, 14, 22),
      channel: "ATL",
      projectId: "atlas",
      body: `Status changed: To Do → In Progress. You are watching this issue.`,
      meta: { key: "ATL-431", status: "In Progress", priority: "low", assignee: P.wei.name, reporter: P.lena.name },
    }),

    // ───────────────────────────── Linear ─────────────────────────────
    sig("linear", "issue", {
      id: "linear-prd-91",
      title: "PRD-91 Decide: keep or remove 'skip tour' in onboarding",
      author: P.lena,
      timestamp: at(-1, 15, 50),
      channel: "PRD",
      projectId: "atlas",
      body: `Engineering handoff is waiting on this decision. Data: 31% of beta users clicked 'skip tour'; checklist completion is 2.1x higher for users who did not skip.`,
      meta: { key: "PRD-91", status: "Todo", priority: "high", assignee: user.name, reporter: P.lena.name, dueDate: at(1, 17) },
    }),
    sig("linear", "issue", {
      title: "PRD-88 Write Atlas 2.0 release notes",
      author: user,
      timestamp: at(-1, 17, 0),
      channel: "PRD",
      projectId: "atlas",
      body: `Release notes drafted and handed to marketing.`,
      meta: { key: "PRD-88", status: "Done", priority: "medium", assignee: user.name, reporter: P.tomas.name, dueDate: at(0, 17) },
    }),
    sig("linear", "issue", {
      id: "linear-prd-94",
      title: "PRD-94 Activation funnel dashboard for the board",
      author: P.mia,
      timestamp: at(-1, 13, 0),
      channel: "PRD",
      projectId: "board",
      body: `Funnel from signup → first workflow → activated team. Numbers ready ${day(2)} morning.`,
      meta: { key: "PRD-94", status: "In Progress", priority: "medium", assignee: P.mia.name, reporter: user.name, dueDate: at(2, 10) },
    }),
    sig("linear", "issue", {
      id: "linear-prd-97",
      title: "PRD-97 Q1 discovery: AI-assisted workflow suggestions",
      author: user,
      timestamp: at(-4, 10, 0),
      channel: "PRD",
      body: `Interview 8 customers about where they get stuck building workflows. Synthesize into an opportunity brief.`,
      meta: { key: "PRD-97", status: "Backlog", priority: "low", assignee: user.name, reporter: user.name },
    }),
    sig("linear", "issue", {
      title: "PRD-80 Moved to Backlog by triage automation",
      author: bot("Linear", "linear-bot"),
      timestamp: at(0, 4, 0),
      channel: "PRD",
      body: `Auto-closed stale issue after 60 days without activity.`,
      meta: { key: "PRD-80", status: "Backlog", priority: "none", assignee: P.tomas.name },
    }),
  ];

  return { now, timezone: DEMO_TZ, user, people, projects, signals };
}
