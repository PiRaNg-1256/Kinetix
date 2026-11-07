// Meeting preparation: who's coming, what they've said recently, open loops and risks.

import { firstName, sentences, snippet, tokenSet } from "./text.js";
import { matchesMeeting } from "./deadline.js";

/** Find a meeting by free text ("QBR", "go/no-go", "board") or id; defaults to the next one. */
export function findMeeting(ws, query) {
  const now = new Date(ws.now).getTime();
  const upcoming = ws.meetings
    .filter((m) => !m.meta.isOutOfOffice && m.meta.responseStatus !== "declined")
    .sort((a, b) => new Date(a.meta.start).getTime() - new Date(b.meta.start).getTime());
  if (!query) return upcoming.find((m) => new Date(m.meta.start).getTime() > now);
  const q = query.toLowerCase().trim();
  const byId = upcoming.find((m) => m.id === query);
  if (byId) return byId;
  const direct = upcoming.filter((m) => m.title.toLowerCase().includes(q) || matchesMeeting(m.title, q));
  if (direct.length) return direct.find((m) => new Date(m.meta.start).getTime() > now) ?? direct[direct.length - 1];
  const qTokens = tokenSet(q);
  let best;
  for (const m of upcoming) {
    const t = tokenSet(`${m.title} ${m.body} ${(m.meta.attendees ?? []).join(" ")}`);
    let score = 0;
    for (const tok of qTokens) if (t.has(tok)) score++;
    if (score > 0 && (!best || score > best.score)) best = { m, score };
  }
  return best?.m;
}

export function buildMeetingBrief(ws, event) {
  const attendeesRaw = (event.meta.attendees ?? []).filter((a) => a !== ws.user.name);
  const project = ws.projects.find((p) => p.id === event.projectId);
  const eventTokens = tokenSet(`${event.title} ${event.body} ${project?.keywords.join(" ") ?? ""}`);

  const relevant = ws.signals
    .filter((s) => !s.noise.isNoise && s.id !== event.id && s.kind !== "event")
    .map((s) => {
      let score = 0;
      if (project && s.projectId === project.id) score += 3;
      if (attendeesRaw.includes(s.author.name)) score += 2;
      const t = tokenSet(`${s.title} ${s.body}`);
      for (const tok of eventTokens) if (t.has(tok)) score += 0.5;
      return { s, score };
    })
    .filter((x) => x.score >= 2.5)
    .sort((a, b) => b.score - a.score || new Date(b.s.timestamp).getTime() - new Date(a.s.timestamp).getTime())
    .slice(0, 8);

  const attendees = attendeesRaw.map((name) => {
    const person = ws.people.find((p) => p.name === name);
    const latest = ws.signals
      .filter((s) => s.author.name === name && !s.noise.isNoise && s.kind !== "event")
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    return {
      name,
      role: person?.role,
      relationship: person?.relationship,
      recentContext: latest
        ? `${latest.source === "slack" ? "Slack" : latest.source === "gmail" ? "Email" : latest.source}: ${snippet(latest.body, 140)}`
        : undefined,
    };
  });

  const openTasks = ws.tasks
    .filter((t) => t.status === "open" && (t.projectId === event.projectId || (t.requester && attendeesRaw.includes(t.requester))))
    .slice(0, 6)
    .map((t) => ({ id: t.id, title: t.title, bucket: t.bucket }));

  const risks = ws.risks
    .filter((r) => r.projectId && r.projectId === event.projectId)
    .map((r) => ({ id: r.id, title: r.title, severity: r.severity }));

  // Talking points: the risks you need to own, then the agenda.
  const talkingPoints = [];
  for (const r of ws.risks.filter((r) => r.projectId === event.projectId).slice(0, 3)) {
    talkingPoints.push(`${r.title} — ${r.mitigation.split(".")[0]}.`);
  }
  for (const line of event.body.split("\n").filter((l) => /^\s*(\d+[.)]|[-*•])\s+/.test(l))) {
    talkingPoints.push(`Agenda: ${line.replace(/^\s*(\d+[.)]|[-*•])\s+/, "")}`);
  }

  // Questions attendees have asked that still need an answer.
  const questions = [];
  for (const { s } of relevant) {
    if (!attendeesRaw.includes(s.author.name)) continue;
    for (const q of sentences(s.body).filter((x) => x.endsWith("?"))) {
      questions.push(`${firstName(s.author.name)}: “${snippet(q, 160)}”`);
    }
  }

  const agenda = event.body
    .split("\n")
    .filter((l) => /^\s*(\d+[.)]|[-*•])\s+/.test(l))
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s+/, "").trim());
  const firstLine = event.body.split("\n")[0]?.trim() ?? "";
  const purpose =
    firstLine && !firstLine.endsWith(":")
      ? firstLine
      : agenda.length
        ? `Cover ${agenda.join("; ")}${project ? ` — with ${project.name} on the line` : ""}.`
        : project
          ? `Discuss ${project.name}`
          : "Sync";

  return {
    eventId: event.id,
    title: event.title,
    start: event.meta.start,
    end: event.meta.end,
    attendees,
    purpose,
    context: relevant.map(({ s }) => ({
      signalId: s.id,
      source: s.source,
      title: s.title,
      snippet: snippet(s.body, 200),
      timestamp: s.timestamp,
    })),
    openTasks,
    risks,
    talkingPoints: talkingPoints.slice(0, 6),
    questions: Array.from(new Set(questions)).slice(0, 5),
  };
}
