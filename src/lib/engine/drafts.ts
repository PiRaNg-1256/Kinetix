// Template-based drafting used by the offline engine. When Claude is available, the agent
// writes drafts itself and only uses these functions' inputs as context.

import type { EmailDraft, Signal, WorkspaceSnapshot } from "../types.ts";
import { formatDay } from "../time.ts";
import { firstName, sentences, tokenSet } from "./text.ts";

type Snapshot = Pick<WorkspaceSnapshot, "signals" | "tasks" | "risks" | "people" | "projects" | "meetings" | "user" | "now" | "timezone">;

function emailOf(ws: Snapshot, name: string): string {
  return ws.people.find((p) => p.name === name)?.email ?? name;
}

function section(body: string, heading: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase() === heading.toLowerCase());
  if (start < 0) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) {
      if (out.length) break;
      continue;
    }
    if (!/^\s*[-*•]/.test(line)) break;
    out.push(line.replace(/^\s*[-*•]\s*/, "").trim());
  }
  return out;
}

/** Notes doc that belongs to a meeting: same project and matching words, edited after it started. */
export function findMeetingNotes(ws: Snapshot, event: Signal): Signal | undefined {
  const words = tokenSet(event.title);
  return ws.signals
    .filter((s) => s.kind === "doc" && /notes|recap|minutes/i.test(s.title))
    .map((s) => {
      const t = tokenSet(s.title);
      let overlap = 0;
      for (const w of words) if (t.has(w)) overlap++;
      return { s, overlap };
    })
    .filter((x) => x.overlap >= 2 || (x.overlap >= 1 && x.s.projectId === event.projectId))
    .sort((a, b) => b.overlap - a.overlap)[0]?.s;
}

export function draftMeetingFollowUp(ws: Snapshot, event: Signal): EmailDraft {
  const notes = findMeetingNotes(ws, event);
  const attendees = (event.meta.attendees ?? []).filter((a) => a !== ws.user.name);
  const decisions = notes ? section(notes.body, "Decisions") : [];
  const actions = notes ? section(notes.body, "Action items") : [];
  const me = firstName(ws.user.name);
  const day = formatDay(event.meta.start!, ws.timezone);

  const lines = [
    `Hi all,`,
    ``,
    `Thanks for the time on ${day}. A quick recap of where we landed on ${event.title.toLowerCase().startsWith("atlas") ? event.title : `the ${event.title}`}:`,
    ``,
  ];
  if (decisions.length) {
    lines.push(`Decisions`);
    for (const d of decisions) lines.push(`• ${d}`);
    lines.push(``);
  }
  if (actions.length) {
    lines.push(`Next steps`);
    for (const a of actions) {
      const [owner, ...rest] = a.split(/\s+[—–-]\s+/);
      const task = rest.join(" — ");
      if (owner && task && owner.trim() === me && /send a recap|^decide/i.test(task)) continue;
      lines.push(`• ${owner?.trim() === me ? "Me" : owner?.trim()}: ${task || a}`);
    }
    lines.push(``);
  }
  if (!decisions.length && !actions.length) {
    lines.push(`• [Add the key decisions here]`, `• [Add owners and dates for next steps]`, ``);
  }
  const open = ws.tasks.filter((t) => t.status === "open" && t.projectId === event.projectId && t.kind === "decide").slice(0, 2);
  for (const t of open) lines.push(`I still owe the group a decision on: ${t.title.replace(/^Decide:?\s*/i, "")}. I'll close that out ${t.due ? `by ${formatDay(t.due, ws.timezone)}` : "shortly"}.`);
  if (open.length) lines.push(``);
  lines.push(`Shout if I missed anything.`, ``, `Thanks,`, me);

  return {
    to: attendees.map((a) => emailOf(ws, a)),
    subject: `Recap: ${event.title} (${day})`,
    body: lines.join("\n"),
  };
}

export function draftReply(ws: Snapshot, signal: Signal): EmailDraft {
  const name = firstName(signal.author.name);
  const me = firstName(ws.user.name);
  const related = ws.signals.filter(
    (s) => s.kind === "issue" && s.projectId === signal.projectId && !/^(done|closed)$/i.test(s.meta.status ?? ""),
  );
  const lines = [`Hi ${name},`, ``, `Thanks for flagging this — you're right to push, and I want to give you a straight answer.`, ``];
  for (const issue of related.slice(0, 3)) {
    const summary = issue.title.replace(issue.meta.key ?? "", "").trim();
    const due = issue.meta.dueDate ? new Date(issue.meta.dueDate) : undefined;
    const overdue = due && due.getTime() < new Date(ws.now).getTime();
    lines.push(
      `• ${summary}: status “${issue.meta.status}”, owned by ${issue.meta.assignee ?? "the team"}.${overdue ? " This slipped from our original commitment — I'll come back with a firm date." : ""} ${sentences(issue.body)[0] ?? ""}`.trimEnd(),
    );
  }
  if (related.length) lines.push(``);
  lines.push(`I'll confirm dates and owners in writing by end of day, and I'll keep you updated until each item is closed.`, ``, `Best,`, me);
  return {
    to: [signal.author.email ?? signal.author.name],
    subject: signal.title.toLowerCase().startsWith("re:") ? signal.title : `Re: ${signal.title}`,
    body: lines.join("\n"),
  };
}
