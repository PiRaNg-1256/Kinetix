// Entry point for loading a workspace snapshot in either mode.

import type { ConnectorStatus, Signal, WorkspaceSnapshot } from "./types.ts";
import { buildDemoWorkspace } from "./demo/data.ts";
import { buildSnapshot } from "./engine/workspace.ts";
import { CONNECTORS } from "./connectors/index.ts";
import { hasAnthropicKey, liveProjects, liveTimezone, liveUser, personClassifier } from "./config.ts";
import { classifyNoise } from "./engine/noise.ts";
import { triageWithClaude } from "./agent/triage.ts";

const SOURCE_NAMES: Record<string, string> = {
  gmail: "Gmail",
  slack: "Slack",
  calendar: "Google Calendar",
  notion: "Notion",
  jira: "Jira",
  linear: "Linear",
};

export function loadDemoWorkspace(real = new Date()): WorkspaceSnapshot {
  const raw = buildDemoWorkspace(real);
  const counts = new Map<string, number>();
  for (const s of raw.signals) counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
  const connectors: ConnectorStatus[] = CONNECTORS.map((c) => ({
    id: c.id,
    name: SOURCE_NAMES[c.id],
    connected: true,
    mode: "demo",
    signalCount: counts.get(c.id) ?? 0,
  }));
  return buildSnapshot({ ...raw, mode: "demo", connectors });
}

export function liveConfigured(): boolean {
  return CONNECTORS.some((c) => c.isConfigured());
}

let liveCache: { at: number; snapshot: WorkspaceSnapshot } | undefined;
const LIVE_TTL_MS = 2 * 60_000;

export async function loadLiveWorkspace(opts: { force?: boolean } = {}): Promise<WorkspaceSnapshot> {
  if (!opts.force && liveCache && Date.now() - liveCache.at < LIVE_TTL_MS) return liveCache.snapshot;

  const now = new Date();
  const user = liveUser();
  const timezone = liveTimezone();
  const projects = liveProjects();
  const classify = personClassifier(user);
  const lookbackDays = Number(process.env.KINETIX_LOOKBACK_DAYS ?? 3);

  const results = await Promise.allSettled(
    CONNECTORS.map(async (c) => {
      if (!c.isConfigured()) return { id: c.id, signals: [] as Signal[], configured: false };
      const res = await c.fetch({ user, now, timezone, lookbackDays, classify });
      return { id: c.id, signals: res.signals, configured: true };
    }),
  );

  const signals: Signal[] = [];
  const connectors: ConnectorStatus[] = CONNECTORS.map((c, i) => {
    const r = results[i];
    if (r.status === "fulfilled") {
      signals.push(...r.value.signals);
      return {
        id: c.id,
        name: SOURCE_NAMES[c.id],
        connected: r.value.configured,
        mode: r.value.configured ? "live" : "off",
        signalCount: r.value.signals.length,
        setupHint: r.value.configured ? undefined : c.setupHint,
      };
    }
    return {
      id: c.id,
      name: SOURCE_NAMES[c.id],
      connected: false,
      mode: "live",
      signalCount: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      setupHint: c.setupHint,
    };
  });

  // Tag signals with projects by keyword.
  for (const s of signals) {
    if (s.projectId) continue;
    const text = `${s.title} ${s.body} ${s.channel ?? ""}`.toLowerCase();
    const match = projects.find((p) => p.keywords.some((k) => text.includes(k)));
    if (match) s.projectId = match.id;
  }

  // People directory = everyone we've seen.
  const people = new Map<string, NonNullable<Signal["author"]>>([[user.name, user]]);
  for (const s of signals) if (!people.has(s.author.name)) people.set(s.author.name, s.author);

  let conversationCandidates;
  if (hasAnthropicKey() && process.env.KINETIX_LLM_TRIAGE !== "off") {
    try {
      const relevant = signals.filter((s) => !classifyNoise(s, { user, now }).isNoise);
      conversationCandidates = await triageWithClaude(relevant, { user, people: [...people.values()], projects, now, timezone });
    } catch (err) {
      console.error("Claude triage failed; falling back to rules", err);
    }
  }

  const snapshot = buildSnapshot({
    mode: "live",
    now,
    timezone,
    user,
    people: [...people.values()],
    projects,
    signals,
    connectors,
    conversationCandidates,
  });
  liveCache = { at: Date.now(), snapshot };
  return snapshot;
}

export async function loadWorkspace(mode: "demo" | "live", opts: { force?: boolean } = {}): Promise<WorkspaceSnapshot> {
  return mode === "demo" ? loadDemoWorkspace() : loadLiveWorkspace(opts);
}
