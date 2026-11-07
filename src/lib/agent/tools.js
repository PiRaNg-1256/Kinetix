// Tools the agent can call. Shared by the Claude agent and the offline engine so both
// produce answers grounded in exactly the same data.

import { z } from "zod";
import { buildMeetingBrief, findMeeting } from "../engine/brief.js";
import { findMeetingNotes } from "../engine/drafts.js";
import { snippet, tokenSet } from "../engine/text.js";
import { describeDue, formatDay, formatTime, sameDay, DAY } from "../time.js";
import { createGmailDraft } from "../connectors/google.js";

/**
 * Events streamed from /api/chat to the browser, one JSON object per line (NDJSON).
 *
 * @typedef {(
 *   | { type: "text", delta: string }
 *   | { type: "tool", id: string, name: string, label: string }
 *   | { type: "tool_done", id: string, summary: string }
 *   | { type: "draft", draft: import("../types.js").EmailDraft }
 *   | { type: "brief", brief: import("../types.js").MeetingBrief }
 *   | { type: "task_update", taskId: string, status: "done" | "snoozed" | "open" }
 *   | { type: "notice", message: string }
 *   | { type: "done", engine: "claude" | "offline", model?: string }
 *   | { type: "error", message: string }
 * )} AgentEvent
 */

export function applyOverrides(ws, overrides = {}) {
  const tasks = ws.tasks.map((t) => {
    const o = overrides[t.id];
    return o?.status ? { ...t, status: o.status } : t;
  });
  return { ...ws, tasks, stats: { ...ws.stats, openTasks: tasks.filter((t) => t.status === "open").length } };
}

// ───────────────────────────── Schemas ─────────────────────────────

export const schemas = {
  get_daily_briefing: z.object({}),
  list_tasks: z.object({
    bucket: z.enum(["now", "next", "later", "all"]).optional(),
    project_id: z.string().optional(),
    include_done: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  search_workspace: z.object({
    query: z.string().min(1),
    source: z.enum(["gmail", "slack", "calendar", "notion", "jira", "linear"]).optional(),
    include_noise: z.boolean().optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  get_signal: z.object({ signal_id: z.string() }),
  get_calendar: z.object({ range: z.enum(["today", "tomorrow", "week", "past_week"]).optional() }),
  prepare_meeting_brief: z.object({ meeting: z.string().describe("meeting id or a few words from its title, e.g. 'QBR'") }),
  get_project_risks: z.object({ project_id: z.string().optional() }),
  save_email_draft: z.object({
    to: z.array(z.string()).min(1),
    cc: z.array(z.string()).optional(),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  update_task: z.object({ task_id: z.string(), status: z.enum(["done", "snoozed", "open"]) }),
};

const DESCRIPTIONS = {
  get_daily_briefing:
    "Snapshot of the user's day: counts, the top-priority tasks, today's meetings, high-severity risks and what was filtered as noise. Start here for open-ended questions like 'what should I focus on' or 'catch me up'.",
  list_tasks:
    "The self-managing, prioritized task list. Each task has a 0-100 score, a bucket (now/next/later), due date, requester, source signals and the reasons behind its rank.",
  search_workspace:
    "Keyword search across all connected tools (emails, Slack, calendar, docs, tickets). Returns ids, titles, authors and snippets. Use get_signal for the full text.",
  get_signal: "Full content of one signal (email, message, event, doc, issue) plus the other messages in its thread.",
  get_calendar: "Meetings for a time range, with attendees and whether prep is likely needed.",
  prepare_meeting_brief:
    "Assemble prep material for a meeting: attendees and their recent context, related messages/docs/tickets, open tasks, risks, open questions attendees have asked, and the notes doc if one exists.",
  get_project_risks:
    "Detected project risks (blocked work, capacity gaps, readiness gaps, customer escalations, overdue commitments, unanswered threads) with evidence ids and suggested mitigations.",
  save_email_draft:
    "Save an email draft for the user to review. In live mode this creates a Gmail draft; it never sends. Call this after writing any follow-up or reply email.",
  update_task: "Mark a task done, snooze it, or reopen it when the user asks.",
};

const LABELS = {
  get_daily_briefing: () => "Reading today's briefing",
  list_tasks: (i) => `Checking ${i.bucket && i.bucket !== "all" ? `“${i.bucket}” ` : ""}tasks`,
  search_workspace: (i) => `Searching for “${i.query}”`,
  get_signal: () => "Opening the full thread",
  get_calendar: (i) => `Looking at ${i.range ?? "today"}'s calendar`,
  prepare_meeting_brief: (i) => `Preparing brief: ${i.meeting}`,
  get_project_risks: (i) => `Scanning risks${i.project_id ? ` for ${i.project_id}` : ""}`,
  save_email_draft: (i) => `Saving draft: ${i.subject}`,
  update_task: (i) => `Marking task ${i.status}`,
};

export function toolLabel(name, input) {
  const fn = LABELS[name];
  return fn ? fn(input ?? {}) : name;
}

export function toolDefinitions() {
  return Object.keys(schemas).map((name) => {
    const json = z.toJSONSchema(schemas[name], { target: "draft-7" });
    delete json.$schema;
    return {
      name,
      description: DESCRIPTIONS[name],
      input_schema: { type: "object", ...json },
      eager_input_streaming: true,
    };
  });
}

// ──────────────────────────── Executors ────────────────────────────

function taskView(t, ws) {
  const now = new Date(ws.now);
  return {
    id: t.id,
    title: t.title,
    score: t.score,
    bucket: t.bucket,
    status: t.status,
    due: t.due ? describeDue(t.due, now, ws.timezone) : null,
    requester: t.requester ?? null,
    project: ws.projects.find((p) => p.id === t.projectId)?.name ?? null,
    sources: t.sources,
    source_signal_ids: t.sourceSignalIds,
    why: t.reasons,
    detail: t.detail,
    auto_closed: t.autoClosedReason ?? null,
  };
}

function signalView(s, ws, full = false) {
  return {
    id: s.id,
    source: s.source,
    kind: s.kind,
    title: s.title,
    from: s.author.name,
    from_role: s.author.role ?? null,
    when: `${formatDay(s.timestamp, ws.timezone)} ${formatTime(s.timestamp, ws.timezone)}`,
    channel: s.channel ?? null,
    project: s.projectId ?? null,
    noise: s.noise.isNoise ? s.noise.reason : null,
    ...(full ? { body: s.body, meta: s.meta, url: s.url ?? null } : { snippet: snippet(s.body, 220) }),
  };
}

function meetingView(m, ws) {
  return {
    id: m.id,
    title: m.title,
    when: `${formatDay(m.meta.start, ws.timezone)} ${formatTime(m.meta.start, ws.timezone)}–${m.meta.end ? formatTime(m.meta.end, ws.timezone) : ""}`,
    attendees: m.meta.attendees ?? [],
    organizer: m.meta.organizer ?? null,
    your_response: m.meta.responseStatus ?? null,
    out_of_office: m.meta.isOutOfOffice ?? false,
    description: snippet(m.body, 300),
    has_prep_task: ws.tasks.some((t) => t.kind === "prep" && t.sourceSignalIds.includes(m.id)),
  };
}

export async function runTool(name, rawInput, ctx) {
  const schema = schemas[name];
  if (!schema) return { ok: false, result: { error: `Unknown tool ${name}` }, summary: "unknown tool" };
  const parsed = schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      result: { INVALID_INPUT: JSON.stringify(rawInput), issues: parsed.error.issues.map((i) => i.message) },
      summary: "invalid input",
    };
  }
  const input = parsed.data;
  const { ws } = ctx;
  const now = new Date(ws.now);

  switch (name) {
    case "get_daily_briefing": {
      const open = ws.tasks.filter((t) => t.status === "open");
      const today = ws.meetings
        .filter((m) => sameDay(new Date(m.meta.start), now, ws.timezone) && m.meta.responseStatus !== "declined" && !m.meta.isOutOfOffice)
        .sort((a, b) => a.meta.start.localeCompare(b.meta.start));
      const result = {
        user: ws.user.name,
        now: `${formatDay(ws.now, ws.timezone)} ${formatTime(ws.now, ws.timezone)} (${ws.timezone})`,
        mode: ws.mode,
        stats: ws.stats,
        focus_now: open.filter((t) => t.bucket === "now").map((t) => taskView(t, ws)),
        up_next: open
          .filter((t) => t.bucket === "next")
          .slice(0, 6)
          .map((t) => ({ id: t.id, title: t.title, score: t.score, due: t.due ? describeDue(t.due, now, ws.timezone) : null })),
        meetings_today: today.map((m) => meetingView(m, ws)),
        high_risks: ws.risks.filter((r) => r.severity === "high").map((r) => ({ id: r.id, title: r.title, mitigation: r.mitigation })),
        auto_closed: ws.tasks.filter((t) => t.autoClosedReason).map((t) => ({ title: t.title, why: t.autoClosedReason })),
        noise_examples: ws.signals
          .filter((s) => s.noise.isNoise)
          .slice(0, 6)
          .map((s) => `${s.title} — ${s.noise.reason}`),
        projects: ws.projects.map((p) => ({ id: p.id, name: p.name, description: p.description })),
      };
      return { ok: true, result, summary: `${open.length} open tasks, ${today.length} meetings, ${result.high_risks.length} high risks` };
    }
    case "list_tasks": {
      const bucket = input.bucket ?? "all";
      let tasks = ws.tasks.filter((t) => (input.include_done ? true : t.status === "open"));
      if (bucket !== "all") tasks = tasks.filter((t) => t.bucket === bucket);
      if (input.project_id) tasks = tasks.filter((t) => t.projectId === input.project_id);
      tasks = tasks.slice(0, input.limit ?? 20);
      return { ok: true, result: tasks.map((t) => taskView(t, ws)), summary: `${tasks.length} tasks` };
    }
    case "search_workspace": {
      const q = tokenSet(String(input.query));
      const raw = String(input.query).toLowerCase();
      const hits = ws.signals
        .filter((s) => (input.include_noise ? true : !s.noise.isNoise))
        .filter((s) => !input.source || s.source === input.source)
        .map((s) => {
          const hay = `${s.title} ${s.body} ${s.author.name} ${s.channel ?? ""} ${(s.meta.attendees ?? []).join(" ")}`.toLowerCase();
          let score = hay.includes(raw) ? 3 : 0;
          for (const t of q) if (hay.includes(t)) score++;
          return { s, score };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.s.timestamp.localeCompare(a.s.timestamp))
        .slice(0, input.limit ?? 10)
        .map((x) => signalView(x.s, ws));
      return { ok: true, result: hits, summary: `${hits.length} results` };
    }
    case "get_signal": {
      const s = ws.signals.find((x) => x.id === input.signal_id);
      if (!s) return { ok: false, result: { error: "No signal with that id" }, summary: "not found" };
      const thread = s.threadId
        ? ws.signals.filter((x) => x.threadId === s.threadId && x.id !== s.id).map((x) => signalView(x, ws, true))
        : [];
      return { ok: true, result: { ...signalView(s, ws, true), thread }, summary: s.title };
    }
    case "get_calendar": {
      const range = input.range ?? "today";
      const meetings = ws.meetings
        .filter((m) => {
          const start = new Date(m.meta.start);
          if (range === "today") return sameDay(start, now, ws.timezone);
          if (range === "tomorrow") return sameDay(start, new Date(now.getTime() + DAY), ws.timezone);
          if (range === "past_week") return start < now && now.getTime() - start.getTime() < 7 * DAY;
          return start >= now && start.getTime() - now.getTime() < 7 * DAY;
        })
        .sort((a, b) => a.meta.start.localeCompare(b.meta.start))
        .map((m) => meetingView(m, ws));
      return { ok: true, result: meetings, summary: `${meetings.length} events` };
    }
    case "prepare_meeting_brief": {
      const m = findMeeting(ws, String(input.meeting));
      if (!m)
        return {
          ok: false,
          result: { error: `No meeting matching “${input.meeting}”`, upcoming: ws.meetings.map((x) => x.title) },
          summary: "no match",
        };
      const brief = buildMeetingBrief(ws, m);
      const notes = findMeetingNotes(ws, m);
      ctx.emit({ type: "brief", brief });
      return {
        ok: true,
        result: {
          ...brief,
          when: meetingView(m, ws).when,
          notes_doc: notes ? { id: notes.id, title: notes.title, body: notes.body } : null,
        },
        summary: `${brief.context.length} related items, ${brief.risks.length} risks`,
      };
    }
    case "get_project_risks": {
      const risks = ws.risks.filter((r) => !input.project_id || r.projectId === input.project_id);
      return {
        ok: true,
        result: risks.map((r) => ({ ...r, project: ws.projects.find((p) => p.id === r.projectId)?.name ?? null })),
        summary: `${risks.length} risks`,
      };
    }
    case "save_email_draft": {
      const draft = {
        to: input.to,
        cc: input.cc,
        subject: String(input.subject),
        body: String(input.body),
      };
      if (ws.mode === "live" && ws.connectors.find((c) => c.id === "gmail")?.connected) {
        try {
          draft.id = await createGmailDraft(draft);
          draft.savedTo = "gmail";
        } catch (err) {
          ctx.emit({
            type: "notice",
            message: `Couldn't save to Gmail (${err instanceof Error ? err.message : "error"}); draft shown here only.`,
          });
        }
      } else {
        draft.savedTo = "demo";
      }
      ctx.emit({ type: "draft", draft });
      return {
        ok: true,
        result: {
          saved:
            draft.savedTo === "gmail" ? "Saved as a Gmail draft (not sent)" : "Shown to the user for review (demo mode — nothing is sent)",
        },
        summary: draft.savedTo === "gmail" ? "saved to Gmail drafts" : "draft ready for review",
      };
    }
    case "update_task": {
      const task = ws.tasks.find((t) => t.id === input.task_id);
      if (!task) return { ok: false, result: { error: "No task with that id" }, summary: "not found" };
      const status = input.status;
      task.status = status;
      ctx.emit({ type: "task_update", taskId: task.id, status });
      return { ok: true, result: { updated: task.title, status }, summary: `${status}: ${task.title}` };
    }
  }
}
