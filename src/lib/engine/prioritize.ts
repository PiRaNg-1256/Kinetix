// Merges duplicate candidates across tools and scores them. Every score comes with the
// reasons that produced it so the user can see *why* something is at the top.

import type { Bucket, Person, Project, SourceId, Task } from "../types.ts";
import type { TaskCandidate } from "./extract.ts";
import { containsAny, firstName, jaccard, tokenSet } from "./text.ts";
import { DAY, HOUR, describeDue } from "../time.ts";

export interface PrioritizeContext {
  now: Date;
  timezone: string;
  people: Person[];
  projects: Project[];
}

const SOURCE_LABEL: Record<SourceId, string> = {
  gmail: "Gmail",
  slack: "Slack",
  calendar: "Calendar",
  notion: "Notion",
  jira: "Jira",
  linear: "Linear",
};

/** "Now" is a focus list: at most NOW_LIMIT open tasks, each above the score floor. */
export const BUCKET_THRESHOLDS = { now: 75, next: 55 } as const;
export const NOW_LIMIT = 5;

// ───────────────────────────── Merge ─────────────────────────────

function shouldMerge(a: TaskCandidate, b: TaskCandidate): boolean {
  if (a.issueKey && a.issueKey === b.issueKey) return true;
  if (a.threadId && a.threadId === b.threadId && a.kind !== "prep" && b.kind !== "prep") return true;
  if (a.quoted.some((q) => b.quoted.includes(q))) return true;
  return jaccard(tokenSet(a.title), tokenSet(b.title)) >= 0.5;
}

const REP_RANK: Record<Task["kind"], number> = { decide: 0, unblock: 1, deliver: 2, review: 2, follow_up: 3, prep: 3, reply: 4 };

export function mergeCandidates(cands: TaskCandidate[]): TaskCandidate[][] {
  const parent = cands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      if (shouldMerge(cands[i], cands[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, TaskCandidate[]>();
  cands.forEach((c, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), c]);
  });
  return Array.from(groups.values());
}

function pickRepresentative(group: TaskCandidate[]): TaskCandidate {
  return [...group].sort((a, b) => {
    // Open beats closed, tickets beat chatter, then the earliest ask wins.
    if (!!a.closedReason !== !!b.closedReason) return a.closedReason ? 1 : -1;
    if (!!a.issueKey !== !!b.issueKey) return a.issueKey ? -1 : 1;
    if (REP_RANK[a.kind] !== REP_RANK[b.kind]) return REP_RANK[a.kind] - REP_RANK[b.kind];
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

// ───────────────────────────── Score ─────────────────────────────

function urgency(due: string | undefined, now: Date): number {
  if (!due) return 0.15;
  const ms = new Date(due).getTime() - now.getTime();
  if (ms < 0) return 1;
  if (ms <= 3 * HOUR) return 0.95;
  if (ms <= 9 * HOUR) return 0.85;
  if (ms <= 30 * HOUR) return 0.7;
  if (ms <= 3 * DAY) return 0.5;
  if (ms <= 7 * DAY) return 0.3;
  return 0.15;
}

const IMPACT_TERMS: { words: string[]; boost: number; label: string }[] = [
  { words: ["reconsider the renewal", "churn", "cancel our", "competitor", "flowstack", "locked out", "escalat"], boost: 0.2, label: "Customer/renewal risk language" },
  { words: ["launch freeze", "go/no-go", "rollback"], boost: 0.1, label: "Gates the launch" },
  { words: ["blocked", "blocker"], boost: 0.1, label: "Someone is blocked on this" },
  { words: ["board"], boost: 0.05, label: "Board visibility" },
  { words: ["exception", "audit", "compliance"], boost: 0.05, label: "Compliance exposure" },
];

function relationshipLabel(p: Person): string {
  const rel = p.relationship;
  if (rel === "customer") return `customer · ${p.role?.split(",").pop()?.trim() ?? ""}`.replace(/ · $/, "");
  if (rel === "exec") return p.role ?? "exec";
  return p.role ?? rel ?? "";
}

export function scoreGroup(group: TaskCandidate[], ctx: PrioritizeContext): Task {
  const rep = pickRepresentative(group);
  const open = group.filter((c) => !c.closedReason);
  const signalIds = Array.from(new Set(group.flatMap((c) => c.signalIds)));
  const sources = Array.from(new Set(group.flatMap((c) => c.sources)));
  const dues = open.map((c) => c.due).filter(Boolean) as string[];
  const due = dues.sort()[0] ?? rep.due;
  const projectId = rep.projectId ?? group.find((c) => c.projectId)?.projectId;
  const project = ctx.projects.find((p) => p.id === projectId);
  const requester = rep.requester ?? group.find((c) => c.requester)?.requester;
  const context = group.map((c) => c.context).join("\n");
  const reasons: string[] = [];

  // Urgency — due date, or how long a blocked/unanswered item has been sitting.
  let u = urgency(due, ctx.now);
  if (due) reasons.push(`Due ${describeDue(due, ctx.now, ctx.timezone)}`);
  const blockedReason = group.flatMap((c) => c.reasons).find((r) => /^Blocked/.test(r));
  if (blockedReason) {
    const days = Number(blockedReason.match(/(\d+) business day/)?.[1] ?? 1);
    u = Math.max(u, Math.min(0.95, 0.6 + 0.1 * days));
  }
  const waiting = group.flatMap((c) => c.reasons).find((r) => /^Waiting on you/.test(r));
  if (waiting) u = Math.max(u, 0.6);

  // Importance — who is asking.
  let importance = requester?.weight ?? (rep.kind === "unblock" ? 0.7 : rep.kind === "follow_up" ? 0.7 : 0.6);
  if (requester && requester.relationship === "automated") importance = 0.35;
  if (requester && requester.relationship !== "automated" && requester.relationship !== "self") {
    reasons.push(`${rep.kind === "prep" ? "With" : "Asked by"} ${requester.name}${relationshipLabel(requester) ? ` (${relationshipLabel(requester)})` : ""}`);
  }

  // Impact — which project, and what the surrounding context says.
  let impact = project?.criticality ?? 0.3;
  if (project) reasons.push(`Part of ${project.name}`);
  for (const term of IMPACT_TERMS) {
    if (containsAny(context, term.words)) {
      impact += term.boost;
      if (term.boost >= 0.1) reasons.push(term.label);
    }
  }
  impact = Math.min(1, impact);

  const pri = Math.max(...group.map((c) => c.priorityHint ?? 0.5));
  if (pri >= 0.8) reasons.push(pri >= 1 ? "Marked urgent" : "Marked high priority");

  // Corroboration — the same ask showing up in several tools is a strong signal.
  const extraSources = sources.length - 1;
  const extraSignals = Math.max(0, signalIds.length - sources.length);
  const corroboration = Math.min(8, extraSources * 4) + Math.min(4, extraSignals * 2);
  if (sources.length > 1) reasons.push(`Raised in ${sources.length} places: ${sources.map((s) => SOURCE_LABEL[s]).join(", ")}`);
  else if (signalIds.length > 1) reasons.push(`${signalIds.length} messages about this`);

  for (const r of group.flatMap((c) => c.reasons)) if (!reasons.includes(r)) reasons.push(r);

  const raw = 100 * (0.34 * u + 0.26 * importance + 0.25 * impact + 0.15 * pri) + corroboration;
  const score = Math.max(1, Math.min(99, Math.round(raw)));
  const bucket: Bucket = score >= BUCKET_THRESHOLDS.now ? "now" : score >= BUCKET_THRESHOLDS.next ? "next" : "later";

  const related = group.filter((c) => c !== rep && !c.closedReason && c.title !== rep.title);
  const detail = [
    rep.detail,
    ...related.map((c) => `Also from ${c.requester ? firstName(c.requester.name) : SOURCE_LABEL[c.sources[0]]}: ${c.title}`),
  ].join("\n");

  const closed = open.length === 0;
  return {
    id: rep.id,
    title: rep.title,
    detail,
    requester: requester?.name,
    due,
    projectId,
    sourceSignalIds: signalIds,
    sources,
    score,
    bucket,
    reasons: reasons.slice(0, 6),
    status: closed ? "done" : "open",
    autoClosedReason: closed ? rep.closedReason : undefined,
    kind: rep.kind,
  };
}

/** Assign buckets by rank: a short "Now" list, then everything worth doing soon. */
/** Assign buckets by rank: a short "Now" list (plus anything due within hours), then the rest. */
export function assignBuckets(tasks: Task[], now: Date): Task[] {
  let rank = 0;
  return tasks.map((t) => {
    if (t.status !== "open") return t;
    const dueSoon = t.due ? new Date(t.due).getTime() - now.getTime() < 4 * HOUR : false;
    let bucket: Bucket = t.score >= BUCKET_THRESHOLDS.next ? "next" : "later";
    if (t.score >= BUCKET_THRESHOLDS.now && (rank < NOW_LIMIT || dueSoon)) bucket = "now";
    rank++;
    return { ...t, bucket };
  });
}

export function sortTasks(tasks: Task[]): Task[] {
  // Higher score first; ties go to the earlier deadline.
  return [...tasks].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ad = a.due ? new Date(a.due).getTime() : Infinity;
    const bd = b.due ? new Date(b.due).getTime() : Infinity;
    return ad - bd;
  });
}

export function prioritize(cands: TaskCandidate[], ctx: PrioritizeContext): Task[] {
  return assignBuckets(sortTasks(mergeCandidates(cands).map((g) => scoreGroup(g, ctx))), ctx.now);
}
