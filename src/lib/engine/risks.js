// Project risk detection. Each detector cites the signals it used as evidence.

import { DAY, businessDaysBetween, formatDay } from "../time.js";
import { containsAny, firstName, issueKeys, snippet } from "./text.js";

const DONE = /^(done|closed|resolved|complete|completed|shipped|canceled|cancelled)$/i;
const NEGATIVE = [
  "reconsider",
  "frustrat",
  "locked out",
  "unacceptable",
  "escalat",
  "cancel",
  "churn",
  "third time",
  "again",
  "shopping",
  "competitor",
  "flowstack",
  "blocked until",
];

function severityFrom(score) {
  return score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low";
}

function relatedSignals(signals, needles, exclude = []) {
  const lower = needles.map((n) => n.toLowerCase()).filter(Boolean);
  return signals.filter((s) => !exclude.includes(s.id) && lower.some((n) => `${s.title} ${s.body}`.toLowerCase().includes(n)));
}

export function detectRisks(signals, ctx) {
  const risks = [];
  const projectOf = (id) => ctx.projects.find((p) => p.id === id);
  const issues = signals.filter((s) => s.kind === "issue");
  const openIssues = issues.filter((s) => !DONE.test(s.meta.status ?? ""));

  // 1. Blocked work on important projects.
  for (const issue of openIssues.filter((s) => /blocked/i.test(s.meta.status ?? ""))) {
    const project = projectOf(issue.projectId);
    const days = issue.meta.statusSince ? Math.max(1, businessDaysBetween(new Date(issue.meta.statusSince), ctx.now, ctx.timezone)) : 1;
    const pri = issue.meta.priority;
    const score =
      (project?.criticality ?? 0.4) * 0.5 + (pri === "urgent" ? 0.35 : pri === "high" ? 0.25 : 0.1) + Math.min(0.2, days * 0.05);
    const evidence = [issue.id, ...relatedSignals(signals, [issue.meta.key ?? "zzz"], [issue.id]).map((s) => s.id)];
    risks.push({
      id: `risk-blocked-${issue.meta.key}`,
      title: `${issue.meta.key} blocked for ${days} business day${days === 1 ? "" : "s"}`,
      severity: severityFrom(score),
      projectId: issue.projectId,
      category: "blocked_work",
      summary: `${issue.title.replace(issue.meta.key ?? "", "").trim()} — ${snippet(issue.body, 160)}`,
      evidence,
      mitigation: `Escalate the blocker today: name an owner for the external dependency and get a committed unblock date.${project?.targetDate ? ` If it can't clear before ${formatDay(project.targetDate, ctx.timezone)}, decide now whether to de-scope it or move the date.` : ""}`,
    });
  }

  // 2. Capacity: someone going out of office while owning open high-priority work.
  for (const ooo of signals.filter((s) => s.kind === "event" && s.meta.isOutOfOffice && s.meta.start)) {
    const who = ooo.meta.organizer ?? ooo.author.name;
    const start = new Date(ooo.meta.start);
    const end = ooo.meta.end ? new Date(ooo.meta.end) : new Date(start.getTime() + DAY);
    if (end.getTime() < ctx.now.getTime()) continue;
    const owned = openIssues.filter((i) => i.meta.assignee === who && (i.meta.priority === "urgent" || i.meta.priority === "high"));
    if (owned.length === 0) continue;
    const critical = owned.some((i) => (projectOf(i.projectId)?.criticality ?? 0) >= 0.8);
    const soleOwner = relatedSignals(signals, ["only one", "only engineer", "sole owner", "bus factor"]).filter(
      (s) => s.author.name === who || owned.some((o) => o.id === s.id),
    );
    risks.push({
      id: `risk-capacity-${firstName(who).toLowerCase()}`,
      title: `${who} is out ${formatDay(start.toISOString(), ctx.timezone)} – ${formatDay(new Date(end.getTime() - 60_000).toISOString(), ctx.timezone)} and owns ${owned.map((o) => o.meta.key).join(", ")}`,
      severity: critical ? "high" : "medium",
      projectId: owned[0].projectId,
      category: "capacity",
      summary: `${owned.length} high-priority item${owned.length > 1 ? "s" : ""} with no backup owner${soleOwner.length ? ` — ${firstName(who)} is the only person with context` : ""}.`,
      evidence: [ooo.id, ...owned.map((o) => o.id), ...soleOwner.map((s) => s.id)],
      mitigation: `Pair a second engineer with ${firstName(who)} before ${formatDay(start.toISOString(), ctx.timezone)} and get a written handoff for ${owned.map((o) => o.meta.key).join(", ")}.`,
    });
  }

  // 3. Launch readiness gaps called out in docs (❌ / ⚠️ / "not written" / "blocked").
  for (const doc of signals.filter((s) => s.kind === "doc" && /readiness|checklist|launch plan/i.test(s.title))) {
    const gaps = doc.body
      .split("\n")
      .filter((l) => /❌|⚠️|not (written|started|done)|blocked|missing/i.test(l))
      .map((l) => l.replace(/^[-*•\s]+/, "").trim());
    if (gaps.length === 0) continue;
    const project = projectOf(doc.projectId);
    const daysLeft = project?.targetDate ? businessDaysBetween(ctx.now, new Date(project.targetDate), ctx.timezone) : undefined;
    const keys = gaps.flatMap((g) => issueKeys(g));
    risks.push({
      id: `risk-readiness-${doc.id}`,
      title: `${gaps.length} launch-readiness item${gaps.length > 1 ? "s" : ""} not ready${daysLeft !== undefined ? ` with ${daysLeft} business days to launch` : ""}`,
      severity: daysLeft !== undefined && daysLeft <= 10 ? "high" : "medium",
      projectId: doc.projectId,
      category: "schedule",
      summary: gaps.join(" · "),
      evidence: [doc.id, ...issues.filter((i) => keys.includes(i.meta.key ?? "")).map((i) => i.id)],
      mitigation: `Assign an owner and a date to each open item before the go/no-go; treat anything without a date as a reason to slip.`,
    });
  }

  // 4. Customer health: negative language from customers.
  const byProject = new Map();
  for (const s of signals) {
    const author = ctx.people.find((p) => p.name === s.author.name);
    const fromCustomer = author?.relationship === "customer";
    const aboutCustomer = s.projectId && projectOf(s.projectId)?.keywords.some((k) => ["renewal"].includes(k));
    if ((fromCustomer || aboutCustomer) && containsAny(`${s.title} ${s.body}`, NEGATIVE)) {
      const key = s.projectId ?? `customer-${author?.email}`;
      byProject.set(key, [...(byProject.get(key) ?? []), s]);
    }
  }
  for (const [key, evidence] of byProject) {
    const project = projectOf(key);
    const hits = evidence.flatMap((s) => NEGATIVE.filter((w) => `${s.title} ${s.body}`.toLowerCase().includes(w)));
    const score = (project?.criticality ?? 0.6) * 0.5 + Math.min(0.5, hits.length * 0.06);
    risks.push({
      id: `risk-customer-${key}`,
      title: project ? `${project.name} at risk` : "Customer escalation",
      severity: severityFrom(score),
      projectId: project?.id,
      category: "customer",
      summary:
        `${evidence.length} recent signals with escalation language (${Array.from(new Set(hits)).slice(0, 5).join(", ")}). ${project?.description ?? ""}`.trim(),
      evidence: evidence.map((s) => s.id),
      mitigation: `Lead with ownership: a root cause, a committed fix date and a named owner for every open promise. Follow up in writing the same day.`,
    });
  }

  // 5. Overdue commitments.
  for (const issue of openIssues.filter((s) => s.meta.dueDate && new Date(s.meta.dueDate).getTime() < ctx.now.getTime())) {
    const days = businessDaysBetween(new Date(issue.meta.dueDate), ctx.now, ctx.timezone);
    const customerFacing = /customer|commitment/i.test(issue.body);
    risks.push({
      id: `risk-overdue-${issue.meta.key}`,
      title: `${issue.meta.key} is ${days} business days overdue${customerFacing ? " (customer commitment)" : ""}`,
      severity: customerFacing || days > 5 ? "high" : "medium",
      projectId: issue.projectId,
      category: "schedule",
      summary: `${issue.title.replace(issue.meta.key ?? "", "").trim()} — status "${issue.meta.status}", owner ${issue.meta.assignee ?? "unassigned"}.`,
      evidence: [
        issue.id,
        ...relatedSignals(
          signals,
          [
            issue.title
              .replace(issue.meta.key ?? "", "")
              .trim()
              .toLowerCase(),
          ],
          [issue.id],
        ).map((s) => s.id),
      ].slice(0, 6),
      mitigation: `Re-plan it explicitly: either commit a new date with the owner or tell the stakeholder it's de-scoped. Silent slips erode trust.`,
    });
  }

  // 6. Important questions left unanswered for 2+ days.
  for (const s of signals.filter((x) => (x.kind === "email" || x.kind === "message") && /\?/.test(x.body))) {
    const author = ctx.people.find((p) => p.name === s.author.name);
    if (!author || (author.weight ?? 0) < 0.8 || author.relationship === "self") continue;
    const waited = businessDaysBetween(new Date(s.timestamp), ctx.now, ctx.timezone);
    if (waited < 2) continue;
    const replied = signals.some(
      (r) => r.threadId && r.threadId === s.threadId && r.author.name === ctx.user.name && new Date(r.timestamp) > new Date(s.timestamp),
    );
    if (replied) continue;
    risks.push({
      id: `risk-unanswered-${s.id}`,
      title: `${author.name} has waited ${waited} business days for an answer`,
      severity: author.relationship === "customer" ? "medium" : "low",
      projectId: s.projectId,
      category: "unanswered",
      summary: `“${s.title}” — ${snippet(s.body, 140)}`,
      evidence: [s.id],
      mitigation: `Reply today, even if only with a date for a full answer.`,
    });
  }

  // 7. Compliance deadlines with repeated external follow-ups.
  const threads = new Map();
  for (const s of signals.filter((x) => x.threadId && x.kind === "email")) threads.set(s.threadId, [...(threads.get(s.threadId) ?? []), s]);
  for (const [, msgs] of threads) {
    const external = msgs.filter((m) => ctx.people.find((p) => p.name === m.author.name)?.relationship === "partner");
    if (external.length < 2) continue;
    if (!containsAny(msgs.map((m) => m.body).join(" "), ["exception", "deadline", "closes", "reminder", "following up"])) continue;
    const project = projectOf(msgs[0].projectId);
    risks.push({
      id: `risk-compliance-${msgs[0].threadId}`,
      title: `${project?.name ?? "External deadline"}: ${external.length} follow-ups, evidence still missing`,
      severity: "medium",
      projectId: project?.id,
      category: "compliance",
      summary: `${external[0].author.name} has followed up ${external.length} times. ${project?.description ?? ""}`.trim(),
      evidence: msgs.map((m) => m.id),
      mitigation: `Confirm owners for each missing item today and reply with a delivery date.`,
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  for (const r of risks) r.evidence = Array.from(new Set(r.evidence));
  return risks.sort((a, b) => order[a.severity] - order[b.severity]);
}
