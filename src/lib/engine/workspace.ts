// Orchestrates the pipeline: raw signals → noise filter → task extraction → merge & score →
// risk detection → snapshot.

import type { ConnectorStatus, Person, Project, Signal, Task, WorkspaceSnapshot } from "../types.ts";
import { classifyNoise } from "./noise.ts";
import { extractCandidates, type TaskCandidate } from "./extract.ts";
import { prioritize } from "./prioritize.ts";
import { detectRisks } from "./risks.ts";
import { sameDay } from "../time.ts";

export interface BuildInput {
  mode: "demo" | "live";
  now: Date;
  timezone: string;
  user: Person;
  people: Person[];
  projects: Project[];
  signals: Signal[];
  connectors: ConnectorStatus[];
  /** Optional replacement extractor (e.g. Claude triage) for emails and messages. */
  conversationCandidates?: TaskCandidate[];
}

export function buildSnapshot(input: BuildInput): WorkspaceSnapshot {
  const { now, timezone, user, people, projects } = input;
  const signals = [...input.signals]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map((s) => ({ ...s, noise: classifyNoise(s, { user, now }) }));
  const relevant = signals.filter((s) => !s.noise.isNoise);

  const ctx = { user, now, timezone, people, projects, all: signals };
  let candidates = extractCandidates(relevant, ctx);
  if (input.conversationCandidates) {
    candidates = [
      ...candidates.filter((c) => !c.sources.every((s) => s === "gmail" || s === "slack")),
      ...input.conversationCandidates,
    ];
  }
  const tasks: Task[] = prioritize(candidates, { now, timezone, people, projects });
  const risks = detectRisks(relevant, { now, timezone, user, people, projects });
  const meetings = signals.filter((s) => s.kind === "event" && s.meta.start);

  return {
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    now: now.toISOString(),
    timezone,
    user,
    connectors: input.connectors,
    people,
    projects,
    signals,
    tasks,
    risks,
    meetings,
    stats: {
      signalsProcessed: signals.length,
      noiseFiltered: signals.filter((s) => s.noise.isNoise).length,
      openTasks: tasks.filter((t) => t.status === "open").length,
      autoClosed: tasks.filter((t) => t.autoClosedReason).length,
      highRisks: risks.filter((r) => r.severity === "high").length,
      meetingsToday: meetings.filter(
        (m) => sameDay(new Date(m.meta.start!), now, timezone) && m.meta.responseStatus !== "declined" && !m.meta.isOutOfOffice,
      ).length,
    },
  };
}
