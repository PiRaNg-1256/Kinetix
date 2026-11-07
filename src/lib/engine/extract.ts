// Turns signals into candidate tasks. Each extractor is rule-based and explainable; in live
// mode an optional Claude triage pass can replace the message/email extractor.

import type { Person, Project, Signal, SourceId, Task } from "../types.ts";
import { addressedToUser, isAutomated } from "./noise.ts";
import { parseDeadline, stripDeadlinePhrases, type DeadlineContext } from "./deadline.ts";
import { capitalize, firstName, issueKeys, quotedPhrases, sentences, snippet, truncate } from "./text.ts";
import { DAY, businessDaysBetween, formatDay } from "../time.ts";

export interface TaskCandidate {
  id: string;
  title: string;
  detail: string;
  requester?: Person;
  due?: string;
  projectId?: string;
  signalIds: string[];
  sources: SourceId[];
  kind: Task["kind"];
  /** 0..1 explicit priority (ticket priority, exec ask, ...). */
  priorityHint?: number;
  threadId?: string;
  issueKey?: string;
  quoted: string[];
  createdAt: string;
  reasons: string[];
  closedReason?: string;
  /** Text used to score impact (concatenated source bodies). */
  context: string;
}

export interface ExtractContext {
  user: Person;
  now: Date;
  timezone: string;
  people: Person[];
  projects: Project[];
  /** Every signal, noise included — needed for thread replies and meetings. */
  all: Signal[];
}

const PRIORITY_VALUE: Record<string, number> = { urgent: 1, high: 0.8, medium: 0.5, low: 0.2, none: 0.3 };
const DONE_STATUS = /^(done|closed|resolved|complete|completed|shipped|canceled|cancelled|won't do)$/i;
const BLOCKED_STATUS = /blocked/i;

export function findPerson(people: Person[], nameOrEmail?: string): Person | undefined {
  if (!nameOrEmail) return undefined;
  const key = nameOrEmail.toLowerCase();
  return people.find((p) => p.name.toLowerCase() === key || p.email?.toLowerCase() === key);
}

function deadlineCtx(ctx: ExtractContext, sentAt?: string): DeadlineContext {
  return {
    now: ctx.now,
    timezone: ctx.timezone,
    meetings: ctx.all.filter((s) => s.kind === "event"),
    sentAt: sentAt ? new Date(sentAt) : undefined,
  };
}

function base(signal: Signal, input: Partial<TaskCandidate> & Pick<TaskCandidate, "title" | "kind">): TaskCandidate {
  const { id: suffix, ...partial } = input;
  return {
    id: `task-${signal.id}${suffix ? `-${suffix}` : ""}`,
    detail: snippet(signal.body, 280),
    signalIds: [signal.id],
    sources: [signal.source],
    projectId: signal.projectId,
    threadId: signal.threadId,
    quoted: quotedPhrases(`${signal.title} ${input.title}`),
    createdAt: signal.timestamp,
    reasons: [],
    context: `${signal.title}\n${signal.body}`,
    ...partial,
  };
}

// ───────────────────────────── Issues ─────────────────────────────

function fromIssue(signal: Signal, ctx: ExtractContext): TaskCandidate[] {
  const { meta } = signal;
  const key = meta.key ?? issueKeys(signal.title)[0];
  const summary = key ? signal.title.replace(key, "").trim() : signal.title;
  const tool = signal.source === "jira" ? "Jira" : "Linear";
  const mine = meta.assignee === ctx.user.name;
  const reportedByMe = meta.reporter === ctx.user.name;
  const done = DONE_STATUS.test(meta.status ?? "");
  const project = ctx.projects.find((p) => p.id === signal.projectId);
  const pri = PRIORITY_VALUE[meta.priority ?? "none"];

  if (done) {
    if (!mine && !reportedByMe) return [];
    return [
      base(signal, {
        title: `${summary} (${key})`,
        kind: "deliver",
        issueKey: key,
        due: meta.dueDate,
        priorityHint: pri,
        closedReason: `${key} was marked ${meta.status} in ${tool}`,
      }),
    ];
  }

  if (mine) {
    const isDecision = /^decide\b/i.test(summary);
    return [
      base(signal, {
        title: `${summary} (${key})`,
        kind: isDecision ? "decide" : "deliver",
        issueKey: key,
        due: meta.dueDate,
        priorityHint: pri,
        requester: findPerson(ctx.people, meta.reporter !== ctx.user.name ? meta.reporter : undefined),
        reasons: [`Assigned to you in ${tool}${meta.status ? ` · ${meta.status}` : ""}`],
      }),
    ];
  }

  // Someone else's ticket that threatens a project you own: surface the unblock/follow-up.
  const critical = (project?.criticality ?? 0) >= 0.8;
  const highPri = meta.priority === "urgent" || meta.priority === "high";
  if (critical && highPri && BLOCKED_STATUS.test(meta.status ?? "")) {
    const since = meta.statusSince ? Math.max(1, businessDaysBetween(new Date(meta.statusSince), ctx.now, ctx.timezone)) : undefined;
    return [
      base(signal, {
        title: `Unblock ${key}: ${summary}`,
        kind: "unblock",
        issueKey: key,
        due: meta.dueDate,
        priorityHint: pri,
        reasons: [`Blocked${since ? ` for ${since} business day${since === 1 ? "" : "s"}` : ""} · owned by ${meta.assignee ?? "unassigned"}`],
      }),
    ];
  }
  if (critical && highPri && meta.dueDate && meta.status && /to ?do|backlog|open/i.test(meta.status)) {
    const due = new Date(meta.dueDate).getTime();
    if (due - ctx.now.getTime() < 1.5 * DAY) {
      return [
        base(signal, {
          title: `Check ${firstName(meta.assignee)} is on track with ${key}: ${summary}`,
          kind: "follow_up",
          issueKey: key,
          due: meta.dueDate,
          priorityHint: pri,
          reasons: [`Due soon and still "${meta.status}"`],
        }),
      ];
    }
  }
  return [];
}

// ──────────────────────────── Meetings ────────────────────────────

const PREP_KEYWORDS = /\b(review|qbr|board|go\/no-go|interview|demo|pitch|kickoff|planning|offsite|negotiation|renewal)\b/i;
const NO_PREP = /\b(standup|stand-up|1:1|one-on-one|focus time|lunch|coffee|social)\b/i;

function fromMeeting(signal: Signal, ctx: ExtractContext): TaskCandidate[] {
  const { meta } = signal;
  if (!meta.start || meta.isOutOfOffice || meta.responseStatus === "declined") return [];
  const start = new Date(meta.start).getTime();
  const until = start - ctx.now.getTime();
  if (until < 0 || until > 2 * DAY) return [];
  if (NO_PREP.test(signal.title)) return [];
  const attendees = (meta.attendees ?? []).map((a) => findPerson(ctx.people, a) ?? { name: a });
  const external = attendees.some((a) => a.relationship === "customer" || a.relationship === "partner");
  const organizer = meta.organizer === ctx.user.name;
  if (!external && !PREP_KEYWORDS.test(signal.title) && !(organizer && attendees.length >= 3)) return [];
  const top = attendees
    .filter((a) => a.name !== ctx.user.name)
    .sort((a, b) => (b.weight ?? 0.4) - (a.weight ?? 0.4));
  const prepLead = external ? 60 : 30;
  return [
    base(signal, {
      id: "prep",
      title: `Prep for ${signal.title}`,
      kind: "prep",
      due: new Date(start - prepLead * 60_000).toISOString(),
      requester: top[0],
      priorityHint: 0.6,
      detail: `${formatDay(meta.start, ctx.timezone)} with ${top.map((a) => a.name).join(", ")}. ${snippet(signal.body, 200)}`,
      reasons: [external ? "External meeting — customer/partner attending" : organizer ? "You're running this meeting" : "High-stakes meeting"],
    }),
  ];
}

// ───────────────────────────── Docs ─────────────────────────────

function fromDoc(signal: Signal, ctx: ExtractContext): TaskCandidate[] {
  const first = firstName(ctx.user.name);
  const re = new RegExp(`^\\s*[-*•]?\\s*@?(${first}|${ctx.user.handle ?? first})\\s*[—:–-]\\s*(.+)$`, "gim");
  const out: TaskCandidate[] = [];
  let i = 0;
  for (const m of signal.body.matchAll(re)) {
    const raw = m[2].trim();
    const due = parseDeadline(raw, deadlineCtx(ctx, signal.timestamp));
    const title = capitalize(stripDeadlinePhrases(raw)).replace(/[.;]$/, "");
    out.push(
      base(signal, {
        id: `ai${i++}`,
        title: truncate(title, 90),
        kind: /^decide/i.test(title) ? "decide" : /recap|follow[- ]?up|send/i.test(title) ? "follow_up" : "deliver",
        due: due?.iso,
        requester: findPerson(ctx.people, signal.author.name),
        detail: `Action item in “${signal.title}”: ${raw}`,
        reasons: [`Action item assigned to you in Notion`],
      }),
    );
  }
  return out;
}

// ─────────────────────── Messages & emails ───────────────────────

interface AskPattern {
  re: RegExp;
  kind: Task["kind"];
  rewrite: (m: RegExpMatchArray) => string;
}

const ASK_PATTERNS: AskPattern[] = [
  { re: /\bI need (?:a call|a decision) on (?:whether )?(.+)/i, kind: "decide", rewrite: (m) => `Decide whether ${m[1]}` },
  { re: /\bI need your (?:sign-off|approval) on (.+)/i, kind: "review", rewrite: (m) => `Approve ${m[1]}` },
  { re: /\bcan we (?:get|have) (.+)/i, kind: "deliver", rewrite: (m) => `Get ${m[1]}` },
  { re: /\b(?:can|could|would|will) you (?:please )?(.+)/i, kind: "deliver", rewrite: (m) => m[1] },
  { re: /\b(?:need|needs) you to (.+)/i, kind: "deliver", rewrite: (m) => m[1] },
  { re: /\bplease (.+)/i, kind: "deliver", rewrite: (m) => m[1] },
];

function cleanAsk(text: string, requester: Person | undefined): string {
  const name = firstName(requester?.name);
  let t = text
    .replace(/[?.!]+(?=\s|$)/g, "")
    .replace(/^come to (the [^,]+?) with (.+)$/i, "Bring $2 to $1")
    .replace(/,\s+(who|which|where)\b.*$/i, "")
    .replace(/\s+(so|so that)\s+(i|we|they|legal|the)\b.*$/i, "")
    .replace(/,?\s+(otherwise|or else)\b.*$/i, "")
    .replace(/\s+(while|since) .*$/i, "")
    .replace(/[?.!]+$/, "")
    .trim();
  if (name) {
    t = t
      .replace(/\b(paired|pair) with me\b/gi, `$1 with ${name}`)
      .replace(/\b(send|give|show|forward|tell|ping|email|update) me\b/gi, `$1 ${name}`)
      .replace(/\bto me\b/gi, `to ${name}`)
      .replace(/\bwith me\b/gi, `with ${name}`);
  }
  t = stripDeadlinePhrases(t).replace(/[\s,;:—–-]+$/, "");
  return truncate(capitalize(t), 96);
}

function classifyKind(title: string, fallback: Task["kind"]): Task["kind"] {
  if (/^(approve|review|confirm|sign off)/i.test(title)) return "review";
  if (/^decide/i.test(title)) return "decide";
  if (/^(send|share|upload|include|write|draft|prepare|get)/i.test(title)) return "deliver";
  if (/^reply/i.test(title)) return "reply";
  return fallback;
}

function fromConversation(signal: Signal, ctx: ExtractContext): TaskCandidate[] {
  const requester = findPerson(ctx.people, signal.author.email) ?? findPerson(ctx.people, signal.author.name) ?? signal.author;
  const toMe = addressedToUser(signal, ctx.user);
  const important = (requester.weight ?? 0) >= 0.8;
  const automated = isAutomated(signal.author);
  if (!toMe && !important) return [];

  // Strip quoted greetings/sign-offs and footer lines before looking for asks.
  const lines = sentences(signal.body).filter(
    (s) => !/^(hi|hey|hello|thanks|thank you|best|cheers|regards|—|-)\b/i.test(s) || s.length > 40,
  );
  const cleaned = lines.map((s) =>
    s
      .replace(/^(hi|hey|hello|morning|good morning)[^,.!]*[,.!]\s*/i, "")
      .replace(/^@?[a-z]+[,:]\s+/i, (m) => (/^@/.test(m) || m.toLowerCase().startsWith(firstName(ctx.user.name).toLowerCase()) ? "" : m))
      .replace(/^(also|and|ok|okay|one more thing)\s*[—,:-]+\s*/i, "")
      .replace(/^[a-z][a-z ]{1,40}:\s+/i, (m) => (automated ? "" : m)),
  );

  let ask: { sentence: string; title: string; kind: Task["kind"] } | undefined;
  for (const sentence of cleaned) {
    for (const p of ASK_PATTERNS) {
      const m = sentence.match(p.re);
      if (m) {
        const title = cleanAsk(p.rewrite(m), requester);
        if (title.length >= 8) {
          ask = { sentence, title, kind: classifyKind(title, p.kind) };
          break;
        }
      }
    }
    if (ask) break;
  }

  const questions = cleaned.filter((s) => s.trim().endsWith("?"));
  if (!ask && questions.length > 0 && (signal.meta.isDM || important)) {
    const etaAsk = questions.find((q) => /\beta\b|when will|timeline/i.test(q));
    ask = {
      sentence: questions.join(" "),
      title: etaAsk
        ? `Reply to ${firstName(requester.name)} with an ETA: ${truncate(signal.title.replace(/^re:\s*/i, "").replace(/\s*[—-]\s*eta\??$/i, ""), 60)}`
        : `Reply to ${firstName(requester.name)}: ${truncate(signal.title.replace(/^re:\s*/i, ""), 70)}`,
      kind: "reply",
    };
  }
  if (!ask) return [];

  const due = parseDeadline(ask.sentence, deadlineCtx(ctx, signal.timestamp)) ?? parseDeadline(signal.body, deadlineCtx(ctx, signal.timestamp));
  const extraQuestions = questions.filter((q) => !ask!.sentence.includes(q));
  const detail = [ask.sentence, ...extraQuestions].join(" ");

  const candidate = base(signal, {
    title: ask.title,
    kind: ask.kind,
    requester,
    due: due?.iso,
    priorityHint: requester.relationship === "exec" || requester.relationship === "customer" ? 0.7 : 0.5,
    detail: snippet(detail, 300),
    quoted: quotedPhrases(ask.sentence),
    issueKey: issueKeys(ask.title)[0],
    reasons: [],
  });

  // Self-managing: if you've already replied later in the same thread, close it.
  if (signal.threadId) {
    const reply = ctx.all.find(
      (s) =>
        s.threadId === signal.threadId &&
        s.author.email?.toLowerCase() === ctx.user.email?.toLowerCase() &&
        new Date(s.timestamp).getTime() > new Date(signal.timestamp).getTime(),
    );
    if (reply) candidate.closedReason = `You already replied in this thread (${formatDay(reply.timestamp, ctx.timezone)})`;
  }

  // Unanswered for 2+ business days from someone important.
  const waited = businessDaysBetween(new Date(signal.timestamp), ctx.now, ctx.timezone);
  if (!candidate.closedReason && waited >= 2 && (requester.weight ?? 0) >= 0.7) {
    candidate.reasons.push(`Waiting on you for ${waited} business days`);
  }
  return [candidate];
}

export function extractCandidates(signals: Signal[], ctx: ExtractContext): TaskCandidate[] {
  const out: TaskCandidate[] = [];
  for (const s of signals) {
    const fromSelf = s.author.email && s.author.email.toLowerCase() === ctx.user.email?.toLowerCase();
    if (fromSelf && (s.kind === "email" || s.kind === "message")) continue;
    switch (s.kind) {
      case "issue":
        out.push(...fromIssue(s, ctx));
        break;
      case "event":
        out.push(...fromMeeting(s, ctx));
        break;
      case "doc":
        out.push(...fromDoc(s, ctx));
        break;
      case "email":
      case "message":
        out.push(...fromConversation(s, ctx));
        break;
    }
  }
  return out;
}
