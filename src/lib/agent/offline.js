// Offline engine: answers common chief-of-staff requests without an LLM, using the same tools
// as the Claude agent. Keeps the demo fully functional with no API key (and as a fallback).

import { buildMeetingBrief, findMeeting } from "../engine/brief.js";
import { draftMeetingFollowUp, draftReply, findMeetingNotes } from "../engine/drafts.js";
import { firstName, jaccard, tokenSet } from "../engine/text.js";
import { describeDue, formatDay, formatTime, sameDay, zonedParts } from "../time.js";
import { runTool, toolLabel } from "./tools.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function stream(emit, text) {
  // Emit in small chunks so the UI renders progressively, like a model would.
  const parts = text.match(/\S+\s*|\s+/g) ?? [text];
  for (let i = 0; i < parts.length; i += 3) {
    emit({ type: "text", delta: parts.slice(i, i + 3).join("") });
    await sleep(14);
  }
}

let toolSeq = 0;
async function useTool(name, input, ws, emit) {
  const id = `offline-${++toolSeq}`;
  emit({ type: "tool", id, name, label: toolLabel(name, input) });
  await sleep(220);
  const r = await runTool(name, input, { ws, emit });
  emit({ type: "tool_done", id, summary: r.summary });
  return r;
}

const SOURCE = { gmail: "Gmail", slack: "Slack", calendar: "Calendar", notion: "Notion", jira: "Jira", linear: "Linear" };

function cite(ws, ids) {
  const s = ids.map((id) => ws.signals.find((x) => x.id === id)).filter(Boolean);
  const labels = Array.from(
    new Set(s.map((x) => (x.meta.key ? `${SOURCE[x.source]} ${x.meta.key}` : `${SOURCE[x.source]} · ${x.author.name}`))),
  );
  return labels.length ? ` _(${labels.slice(0, 3).join("; ")})_` : "";
}

function taskLine(t, ws, i) {
  const due = t.due ? ` — due ${describeDue(t.due, new Date(ws.now), ws.timezone)}` : "";
  return `${i !== undefined ? `${i + 1}.` : "-"} **${t.title}**${due}\n   ${t.reasons
    .filter((r) => !r.startsWith("Due"))
    .slice(0, 2)
    .join(" · ")}${cite(ws, t.sourceSignalIds)}`;
}

function greeting(now, tz) {
  const h = zonedParts(now, tz).hour;
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

// ───────────────────────────── Intents ─────────────────────────────

async function briefing(ws, emit) {
  await useTool("get_daily_briefing", {}, ws, emit);
  const now = new Date(ws.now);
  const open = ws.tasks.filter((t) => t.status === "open");
  const focus = open.filter((t) => t.bucket === "now");
  const meetings = ws.meetings
    .filter(
      (m) =>
        sameDay(new Date(m.meta.start), now, ws.timezone) &&
        m.meta.responseStatus !== "declined" &&
        !m.meta.isOutOfOffice &&
        new Date(m.meta.start) > now,
    )
    .sort((a, b) => a.meta.start.localeCompare(b.meta.start));
  const high = ws.risks.filter((r) => r.severity === "high");
  const closed = ws.tasks.filter((t) => t.autoClosedReason);

  const lines = [
    `Good ${greeting(now, ws.timezone)}, ${firstName(ws.user.name)}. I went through **${ws.stats.signalsProcessed} signals** and filtered **${ws.stats.noiseFiltered}** as noise. Here's what matters:`,
    ``,
    `### Do these first`,
    ...focus.map((t, i) => taskLine(t, ws, i)),
    ``,
    `### Today's meetings`,
    ...meetings.map(
      (m) =>
        `- **${formatTime(m.meta.start, ws.timezone)}** ${m.title}${ws.tasks.some((t) => t.kind === "prep" && t.sourceSignalIds.includes(m.id) && t.status === "open") ? " — _needs prep_" : ""}`,
    ),
    ``,
    `### Risks to watch`,
    ...high.slice(0, 4).map((r) => `- **${r.title}** — ${r.mitigation.split(".")[0]}.`),
  ];
  if (closed.length) {
    lines.push(``, `### Already handled`, ...closed.map((t) => `- ~~${t.title}~~ — ${t.autoClosedReason}`));
  }
  lines.push(
    ``,
    `Want me to prep you for ${meetings.find((m) => ws.tasks.some((t) => t.kind === "prep" && t.sourceSignalIds.includes(m.id)))?.title ?? "your next meeting"}?`,
  );
  await stream(emit, lines.join("\n"));
}

async function focusList(ws, emit) {
  await useTool("list_tasks", { bucket: "all", limit: 12 }, ws, emit);
  const open = ws.tasks.filter((t) => t.status === "open");
  const now = open.filter((t) => t.bucket === "now");
  const next = open.filter((t) => t.bucket === "next").slice(0, 5);
  const later = open.filter((t) => t.bucket === "later");
  const lines = [
    `Here's your plan, ranked by deadline, who's asking, and what's at stake:`,
    ``,
    `### Now`,
    ...now.map((t, i) => taskLine(t, ws, i)),
    ``,
    `### Next`,
    ...next.map((t) => `- ${t.title}${t.due ? ` — ${describeDue(t.due, new Date(ws.now), ws.timezone)}` : ""}`),
  ];
  if (later.length) lines.push(``, `### Can wait`, ...later.map((t) => `- ${t.title}`));
  await stream(emit, lines.join("\n"));
}

function renderBrief(brief, ws, notes) {
  const when = `${formatDay(brief.start, ws.timezone)}, ${formatTime(brief.start, ws.timezone)}`;
  const people = brief.attendees.map(
    (a) => `- **${a.name}**${a.role ? ` — ${a.role}` : ""}${a.recentContext ? `\n   _Latest:_ ${a.recentContext}` : ""}`,
  );
  const lines = [
    `## ${brief.title}`,
    `${when} · ${brief.attendees.length} attendees`,
    ``,
    `**Objective:** ${brief.purpose}`,
    ``,
    `### Who's in the room`,
    ...people,
    ``,
    `### Key context`,
    ...brief.context.slice(0, 5).map((c) => `- ${c.snippet} _(${SOURCE[c.source]} · ${c.title})_`),
  ];
  if (brief.talkingPoints.length) lines.push(``, `### Talking points`, ...brief.talkingPoints.map((t) => `- ${t}`));
  if (brief.risks.length) lines.push(``, `### Landmines`, ...brief.risks.map((r) => `- **${r.severity.toUpperCase()}** · ${r.title}`));
  if (brief.questions.length) lines.push(``, `### Questions they've asked`, ...brief.questions.map((q) => `- ${q}`));
  if (brief.openTasks.length) lines.push(``, `### Your open loops with this group`, ...brief.openTasks.map((t) => `- ${t.title}`));
  if (notes) lines.push(``, `_Notes doc: ${notes.title}_`);
  return lines.join("\n");
}

async function meetingPrep(ws, emit, query) {
  const meeting = findMeeting(ws, query);
  if (!meeting) {
    await useTool("get_calendar", { range: "week" }, ws, emit);
    await stream(
      emit,
      `I couldn't find a meeting matching “${query}”. Upcoming: ${ws.meetings
        .filter((m) => new Date(m.meta.start) > new Date(ws.now))
        .map((m) => m.title)
        .join(", ")}.`,
    );
    return;
  }
  await useTool("prepare_meeting_brief", { meeting: meeting.title }, ws, emit);
  const brief = buildMeetingBrief(ws, meeting);
  await stream(emit, renderBrief(brief, ws, findMeetingNotes(ws, meeting)));
}

async function risks(ws, emit, query) {
  const project = ws.projects.find(
    (p) =>
      query.includes(p.id) ||
      p.keywords.some((k) => k.length > 3 && query.includes(k)) ||
      query.includes(p.name.toLowerCase().split(" ")[0]),
  );
  await useTool("get_project_risks", project ? { project_id: project.id } : {}, ws, emit);
  const list = ws.risks.filter((r) => !project || r.projectId === project.id);
  const byProject = new Map();
  for (const r of list) byProject.set(r.projectId ?? "other", [...(byProject.get(r.projectId ?? "other") ?? []), r]);
  const lines = [
    project
      ? `**${list.filter((r) => r.severity === "high").length} high-severity risks** on ${project.name}${project.targetDate ? ` (target ${formatDay(project.targetDate, ws.timezone)})` : ""}:`
      : `I'm tracking **${list.length} risks**, ${list.filter((r) => r.severity === "high").length} of them high severity:`,
  ];
  for (const [pid, rs] of byProject) {
    if (!project) lines.push(``, `### ${ws.projects.find((p) => p.id === pid)?.name ?? "Other"}`);
    else lines.push(``);
    for (const r of rs) {
      lines.push(`- **[${r.severity.toUpperCase()}] ${r.title}**${cite(ws, r.evidence)}\n   ${r.summary}\n   → _${r.mitigation}_`);
    }
  }
  await stream(emit, lines.join("\n"));
}

async function draft(ws, emit, query) {
  // A reply to a person ("reply to Olivia") or a recap of a meeting ("follow-up for the design review").
  const person = ws.people.find((p) => p.relationship !== "self" && query.includes(firstName(p.name).toLowerCase()));
  const meetingWords = query
    .replace(/\b(draft|write|a|an|the|follow[- ]?up|email|recap|for|to|from|about|on|send|reply|me|please|my|meeting)\b/g, " ")
    .trim();
  if (person && /\b(reply|respond|answer|email)\b/.test(query)) {
    const latest = ws.signals
      .filter((s) => s.author.name === person.name && (s.kind === "email" || s.kind === "message"))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
    if (latest) {
      await useTool("get_signal", { signal_id: latest.id }, ws, emit);
      const d = draftReply(ws, latest);
      await useTool("save_email_draft", { ...d }, ws, emit);
      await stream(
        emit,
        `Drafted a reply to ${person.name} on “${latest.title}”. It pulls in the current status of the related tickets — check the dates before sending. It's saved as a draft for your review.`,
      );
      return;
    }
  }
  const now = new Date(ws.now);
  const past = ws.meetings.filter((m) => new Date(m.meta.start) < now && !m.meta.isOutOfOffice);
  let meeting = meetingWords ? findMeeting({ ...ws, meetings: past.length ? past : ws.meetings }, meetingWords) : undefined;
  if (!meeting) meeting = past.filter((m) => findMeetingNotes(ws, m)).sort((a, b) => b.meta.start.localeCompare(a.meta.start))[0];
  if (!meeting) {
    await stream(emit, "Which meeting or thread should I follow up on?");
    return;
  }
  await useTool("prepare_meeting_brief", { meeting: meeting.title }, ws, emit);
  const d = draftMeetingFollowUp(ws, meeting);
  await useTool("save_email_draft", { ...d }, ws, emit);
  const notes = findMeetingNotes(ws, meeting);
  await stream(
    emit,
    `Drafted a recap for **${meeting.title}**${notes ? `, built from “${notes.title}”` : ""}. It lists the decisions and owners, and calls out the decision you still owe. Review it in the draft card.`,
  );
}

async function markDone(ws, emit, query) {
  const q = tokenSet(query);
  const best = ws.tasks
    .filter((t) => t.status === "open")
    .map((t) => ({ t, s: jaccard(q, tokenSet(`${t.title} ${t.requester ?? ""}`)) }))
    .sort((a, b) => b.s - a.s)[0];
  if (!best || best.s < 0.08) {
    await stream(emit, "Which task do you mean? You can also tick it off in the list.");
    return;
  }
  const status = /snooze|later|tomorrow/.test(query) ? "snoozed" : "done";
  await useTool("update_task", { task_id: best.t.id, status }, ws, emit);
  await stream(
    emit,
    `Done — marked **${best.t.title}** as ${status}. ${status === "done" ? "I'll stop surfacing it." : "I'll bring it back later."}`,
  );
}

async function search(ws, emit, query) {
  const r = await useTool("search_workspace", { query, limit: 6 }, ws, emit);
  const hits = r.result;
  if (!hits.length) {
    await stream(
      emit,
      `I couldn't find anything about that in your workspace. In offline mode I handle: **catch me up**, **what should I focus on**, **prep me for <meeting>**, **draft a follow-up for <meeting>**, **reply to <person>**, **what are the risks**, and **mark <task> done**. Add an Anthropic API key to ask anything.`,
    );
    return;
  }
  await stream(
    emit,
    [
      `Here's what I found:`,
      ``,
      ...hits.map((h) => `- **${h.title}** — ${h.from}, ${h.when} _(${SOURCE[h.source]})_\n   ${h.snippet}`),
    ].join("\n"),
  );
}

export async function runOfflineAgent(ws, history, emit) {
  const last = history.filter((t) => t.role === "user").at(-1)?.content ?? "";
  const q = last.toLowerCase();

  if (
    /\b(mark|tick|check off|snooze)\b.*\b(done|complete|completed|off|later)?\b|\bi (sent|did|finished|approved|replied)\b/.test(q) &&
    !/\b(draft|prep)\b/.test(q)
  ) {
    return markDone(ws, emit, q);
  }
  if (/\b(draft|write|compose|follow[- ]?up|recap|reply|respond)\b/.test(q)) return draft(ws, emit, q);
  if (
    /\b(prep|prepare|ready for|brief me (for|on)|get me ready)\b/.test(q) ||
    (/\bbrief\b/.test(q) && findMeeting(ws, q.replace(/\b(brief|me|for|on|the)\b/g, " ")))
  ) {
    return meetingPrep(ws, emit, q.replace(/\b(prep|prepare|me|for|the|my|get|ready|brief|on|meeting|please|can|you)\b/g, " ").trim());
  }
  if (/\b(risk|risks|worr|blocker|blocked|threat|at risk|slip)\b/.test(q)) return risks(ws, emit, q);
  if (/\b(focus|priorit|to-?do|action items|what should|plan my day|next|tasks)\b/.test(q)) return focusList(ws, emit);
  if (/\b(brief|briefing|summary|summar|today|morning|catch me up|miss|overview|status)\b/.test(q)) return briefing(ws, emit);
  return search(ws, emit, last);
}
