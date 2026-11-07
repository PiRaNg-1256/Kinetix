"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BellOff,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Inbox,
  ListTodo,
  LoaderCircle,
  LogOut,
  MessageCircle,
  Plug,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Undo2,
  VolumeX,
} from "lucide-react";

import { describeDue, formatDay, formatTime, sameDay } from "@/lib/time";
import { Chat } from "./Chat";
import { Logo, ScorePill, SeverityBadge, SourceBadge, SOURCE_META } from "./ui";

const BUCKET_COPY = {
  now: { title: "Now", hint: "Do these first" },
  next: { title: "Next", hint: "This week" },
  later: { title: "Later", hint: "Can wait" },
};

export function Dashboard({ mode }) {
  const [ws, setWs] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("today");
  const [overrides, setOverrides] = useState({});
  const [chatOpen, setChatOpen] = useState(false);
  const sendRef = useRef(null);
  const storageKey = `kinetix:overrides:${mode}`;

  const load = useCallback(
    async (refresh = false) => {
      setRefreshing(true);
      try {
        const res = await fetch(`/api/workspace?mode=${mode}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        setWs(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRefreshing(false);
      }
    },
    [mode],
  );

  useEffect(() => {
    load();
    try {
      setOverrides(JSON.parse(localStorage.getItem(storageKey) ?? "{}"));
    } catch {
      /* ignore */
    }
  }, [load, storageKey]);

  const setTaskStatus = useCallback(
    (taskId, status) => {
      setOverrides((o) => {
        const next = { ...o, [taskId]: { ...o[taskId], status } };
        localStorage.setItem(storageKey, JSON.stringify(next));
        return next;
      });
    },
    [storageKey],
  );

  const ask = useCallback((text) => {
    setChatOpen(true);
    // Let the mobile panel mount before sending.
    setTimeout(() => sendRef.current?.(text), 30);
  }, []);

  const tasks = useMemo(() => {
    if (!ws) return [];
    return ws.tasks.map((t) => (overrides[t.id]?.status ? { ...t, status: overrides[t.id].status } : t));
  }, [ws, overrides]);

  if (error && !ws) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-rose-200 bg-white p-6 text-sm">
          <div className="font-semibold text-rose-700">Couldn't load the workspace</div>
          <p className="mt-2 text-slate-600">{error}</p>
          <button onClick={() => load()} className="mt-4 rounded-lg bg-ink px-3 py-1.5 text-white">
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!ws) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="h-6 w-6 animate-spin text-brand-500" />
        {mode === "demo" ? "Processing the demo workspace…" : "Reading your inbox, Slack, calendar, docs and tickets…"}
      </div>
    );
  }

  const now = new Date(ws.now);
  const open = tasks.filter((t) => t.status === "open");
  const engineLabel =
    ws.agent.engine === "claude" ? `Powered by Claude · ${ws.agent.model}` : "Offline engine · add ANTHROPIC_API_KEY for Claude";
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: ws.timezone }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const nav = [
    { id: "today", label: "Plan", Icon: ListTodo, count: open.length },
    { id: "meetings", label: "Meetings", Icon: CalendarClock, count: ws.stats.meetingsToday },
    { id: "risks", label: "Risks", Icon: ShieldAlert, count: ws.risks.length },
    { id: "signals", label: "Signals", Icon: Inbox, count: ws.signals.length },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-ink text-slate-300 md:flex">
        <Link href="/" className="flex items-center gap-2 px-5 py-5">
          <Logo />
          <span className="text-lg font-semibold tracking-tight text-white">Kinetix</span>
        </Link>
        <nav className="space-y-1 px-3">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                tab === n.id ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <n.Icon className="h-4 w-4" />
                {n.label}
              </span>
              <span className="text-xs text-slate-500">{n.count}</span>
            </button>
          ))}
        </nav>
        <div className="mt-8 px-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Connected sources</div>
        <div className="mt-2 space-y-1 px-3">
          {ws.connectors.map((c) => {
            const M = SOURCE_META[c.id];
            return (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm"
                title={c.error ?? c.setupHint ?? ""}
              >
                <span className="flex items-center gap-2.5">
                  <M.Icon className="h-4 w-4" />
                  {c.name}
                </span>
                {c.connected ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {c.signalCount}
                  </span>
                ) : c.error ? (
                  <span className="text-[11px] text-rose-400">error</span>
                ) : (
                  <span className="text-[11px] text-slate-600">off</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-auto space-y-2 p-4">
          {mode === "demo" ? (
            <Link href="/app" className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10">
              <Plug className="h-3.5 w-3.5" /> Connect your own tools
            </Link>
          ) : (
            <button
              onClick={async () => {
                await fetch("/api/auth", { method: "DELETE" });
                window.location.reload();
              }}
              className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
            >
              <LogOut className="h-3.5 w-3.5" /> Lock live workspace
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {mode === "demo" && (
          <div className="flex items-center justify-center gap-2 bg-brand-600 px-4 py-1.5 text-center text-xs text-white">
            <Sparkles className="h-3.5 w-3.5" />
            Live demo · Quillon is a fictional company and all data is simulated · nothing is ever sent
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8">
            <Link href="/" className="mb-4 flex items-center gap-2 md:hidden">
              <Logo className="h-6 w-6" />
              <span className="font-semibold">Kinetix</span>
            </Link>
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {formatDay(ws.now, ws.timezone)} · {formatTime(ws.now, ws.timezone)}
                  {mode === "demo" && " (demo clock)"}
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {greeting}, {ws.user.name.split(" ")[0]}.
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {open.filter((t) => t.bucket === "now").length} things need you first, {ws.stats.meetingsToday} meetings today,{" "}
                  {ws.stats.highRisks} high risks.
                </p>
              </div>
              <button
                onClick={() => load(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {mode === "live" ? "Sync now" : "Reprocess"}
              </button>
            </header>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Signals processed"
                value={ws.stats.signalsProcessed}
                sub={`across ${ws.connectors.filter((c) => c.connected).length} tools`}
              />
              <Stat
                label="Noise filtered"
                value={ws.stats.noiseFiltered}
                sub={`${Math.round((ws.stats.noiseFiltered / Math.max(1, ws.stats.signalsProcessed)) * 100)}% of inbound`}
              />
              <Stat label="Open tasks" value={open.length} sub={`${ws.stats.autoClosed} auto-closed`} />
              <Stat
                label="High risks"
                value={ws.stats.highRisks}
                sub={`${ws.risks.length} tracked`}
                tone={ws.stats.highRisks ? "text-rose-600" : undefined}
              />
            </div>

            {/* Mobile tabs */}
            <div className="mt-5 flex gap-1 overflow-x-auto md:hidden">
              {nav.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${tab === n.id ? "bg-ink text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
                >
                  {n.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {tab === "today" && <PlanView ws={ws} tasks={tasks} now={now} onStatus={setTaskStatus} ask={ask} />}
              {tab === "meetings" && <MeetingsView ws={ws} now={now} ask={ask} tasks={tasks} />}
              {tab === "risks" && <RisksView ws={ws} ask={ask} />}
              {tab === "signals" && <SignalsView ws={ws} />}
            </div>
            {mode === "live" && ws.connectors.some((c) => c.error) && (
              <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                {ws.connectors
                  .filter((c) => c.error)
                  .map((c) => (
                    <div key={c.id}>
                      <strong>{c.name}:</strong> {c.error}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Chat: side panel on large screens, overlay on small */}
      <aside className="hidden w-[400px] shrink-0 border-l border-slate-200 lg:block">
        <Chat
          mode={mode}
          overrides={overrides}
          onTaskUpdate={setTaskStatus}
          engineLabel={engineLabel}
          registerSend={(fn) => (sendRef.current = fn)}
        />
      </aside>
      {chatOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setChatOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 top-12 overflow-hidden rounded-t-2xl shadow-2xl">
            <Chat
              mode={mode}
              overrides={overrides}
              onTaskUpdate={setTaskStatus}
              engineLabel={engineLabel}
              registerSend={(fn) => (sendRef.current = fn)}
              onClose={() => setChatOpen(false)}
            />
          </div>
        </div>
      )}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg lg:hidden"
      >
        <MessageCircle className="h-4 w-4" /> Ask Kinetix
      </button>
    </div>
  );
}

function Stat({ label, value, sub, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}

// ───────────────────────────── Plan ─────────────────────────────

function PlanView({ ws, tasks, now, onStatus, ask }) {
  const open = tasks.filter((t) => t.status === "open");
  const auto = tasks.filter((t) => t.autoClosedReason);
  const handled = tasks.filter((t) => !t.autoClosedReason && t.status !== "open");
  return (
    <div className="space-y-8">
      {["now", "next", "later"].map((b) => {
        const list = open.filter((t) => t.bucket === b);
        if (!list.length) return null;
        return (
          <section key={b}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">{BUCKET_COPY[b].title}</h2>
              <span className="text-xs text-slate-500">{BUCKET_COPY[b].hint}</span>
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <TaskCard key={t.id} task={t} ws={ws} now={now} onStatus={onStatus} ask={ask} />
              ))}
            </div>
          </section>
        );
      })}
      {auto.length > 0 && (
        <section>
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <CheckCheck className="h-4 w-4 text-emerald-600" /> Closed by Kinetix
            </h2>
            <span className="text-xs text-slate-500">Detected as already done — no action needed</span>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {auto.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-slate-400 line-through">{t.title}</span>
                <span className="shrink-0 text-xs text-emerald-700">{t.autoClosedReason}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {handled.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-500">Done or snoozed by you</h2>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {handled.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-slate-400 line-through">{t.title}</span>
                <button
                  onClick={() => onStatus(t.id, "open")}
                  className="flex shrink-0 items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Reopen
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TaskCard({ task, ws, now, onStatus, ask }) {
  const [open, setOpen] = useState(false);
  const project = ws.projects.find((p) => p.id === task.projectId);
  const overdue = task.due && new Date(task.due).getTime() < now.getTime();
  const signals = task.sourceSignalIds.map((id) => ws.signals.find((s) => s.id === id)).filter(Boolean);
  const prompt =
    task.kind === "prep"
      ? task.title.replace(/^Prep for/, "Prepare me for")
      : task.kind === "reply"
        ? `Draft this for me: ${task.title}`
        : `Help me get this done: ${task.title}`;
  return (
    <div className="group rounded-xl border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start gap-3 p-3.5">
        <button
          onClick={() => onStatus(task.id, "done")}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-300 text-transparent transition hover:border-emerald-500 hover:text-emerald-600"
          aria-label="Mark done"
          title="Mark done"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-1.5 text-left">
            <span className="text-sm font-medium text-slate-900">{task.title}</span>
            {open ? (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            )}
          </button>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {task.due && (
              <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 ${overdue ? "bg-rose-50 text-rose-700" : "bg-slate-100"}`}>
                <Clock className="h-3 w-3" />
                {describeDue(task.due, now, ws.timezone)}
              </span>
            )}
            {task.requester && <span>· {task.requester}</span>}
            {project && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-brand-700">{project.name}</span>}
            {task.sources.map((s) => (
              <SourceBadge key={s} source={s} />
            ))}
          </div>
        </div>
        <ScorePill score={task.score} />
      </div>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3.5 py-3 pl-11 text-sm">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Why it's ranked here</div>
            <ul className="mt-1 space-y-0.5 text-slate-700">
              {task.reasons.map((r) => (
                <li key={r} className="flex gap-1.5">
                  <span className="text-brand-500">•</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <p className="whitespace-pre-line text-slate-600">{task.detail}</p>
          <div className="space-y-1">
            {signals.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs text-slate-500">
                <SourceBadge source={s.source} />
                <span className="truncate">
                  {s.title} — {s.author.name}
                </span>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="shrink-0 text-slate-400 hover:text-slate-700">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => ask(prompt)}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Sparkles className="h-3.5 w-3.5" />{" "}
              {task.kind === "prep" ? "Prep me" : task.kind === "reply" ? "Draft reply" : "Help me with this"}
            </button>
            <button
              onClick={() => onStatus(task.id, "snoozed")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <BellOff className="h-3.5 w-3.5" /> Snooze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Meetings ────────────────────────────

function MeetingsView({ ws, now, ask, tasks }) {
  const meetings = ws.meetings.filter((m) => m.meta.responseStatus !== "declined").sort((a, b) => a.meta.start.localeCompare(b.meta.start));
  const days = new Map();
  for (const m of meetings) {
    const key = formatDay(m.meta.start, ws.timezone);
    days.set(key, [...(days.get(key) ?? []), m]);
  }
  return (
    <div className="space-y-6">
      {[...days.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="mb-2 text-sm font-semibold">
            {day}
            {sameDay(new Date(list[0].meta.start), now, ws.timezone) && (
              <span className="ml-2 text-xs font-normal text-brand-600">Today</span>
            )}
          </h2>
          <div className="space-y-2">
            {list.map((m) => {
              const past = new Date(m.meta.end ?? m.meta.start).getTime() < now.getTime();
              const prep = tasks.find((t) => t.kind === "prep" && t.sourceSignalIds.includes(m.id));
              const people = (m.meta.attendees ?? []).filter((a) => a !== ws.user.name);
              return (
                <div
                  key={m.id}
                  className={`flex flex-wrap items-center gap-4 rounded-xl border bg-white p-3.5 ${m.meta.isOutOfOffice ? "border-dashed border-slate-300" : "border-slate-200"}`}
                >
                  <div className="w-20 shrink-0 text-sm tabular-nums text-slate-500">
                    {m.meta.isOutOfOffice ? "All day" : formatTime(m.meta.start, ws.timezone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${past ? "text-slate-400" : "text-slate-900"}`}>{m.title}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {m.meta.isOutOfOffice ? "Out of office" : people.length ? `With ${people.join(", ")}` : "Just you"}
                    </div>
                  </div>
                  {prep && prep.status === "open" && (
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Needs prep</span>
                  )}
                  {!m.meta.isOutOfOffice &&
                    (past ? (
                      <button
                        onClick={() => ask(`Draft a follow-up email for the ${m.title}`)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Draft follow-up <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : people.length > 0 ? (
                      <button
                        onClick={() => ask(`Prepare me for the ${m.title}`)}
                        className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Prep me
                      </button>
                    ) : null)}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ───────────────────────────── Risks ─────────────────────────────

function RisksView({ ws, ask }) {
  const groups = new Map();
  for (const r of ws.risks) groups.set(r.projectId ?? "other", [...(groups.get(r.projectId ?? "other") ?? []), r]);
  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([pid, risks]) => {
        const project = ws.projects.find((p) => p.id === pid);
        return (
          <section key={pid}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">{project?.name ?? "Other"}</h2>
                {project?.description && <p className="text-xs text-slate-500">{project.description}</p>}
              </div>
              {project && (
                <button
                  onClick={() => ask(`What are the biggest risks to ${project.name} and what should I do about them?`)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Ask for a mitigation plan
                </button>
              )}
            </div>
            <div className="space-y-2">
              {risks.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="flex items-start gap-2">
                    <SeverityBadge severity={r.severity} />
                    <div className="text-sm font-medium text-slate-900">{r.title}</div>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">{r.summary}</p>
                  <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium">Mitigation: </span>
                    {r.mitigation}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.evidence.map((id) => {
                      const s = ws.signals.find((x) => x.id === id);
                      if (!s) return null;
                      return (
                        <span
                          key={id}
                          className="flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200"
                        >
                          <SourceBadge source={s.source} />
                          <span className="max-w-[220px] truncate">{s.meta.key ?? s.title}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ──────────────────────────── Signals ────────────────────────────

function SignalsView({ ws }) {
  const [filter, setFilter] = useState("all");
  const list = ws.signals.filter((s) => (filter === "all" ? true : filter === "noise" ? s.noise.isNoise : !s.noise.isNoise));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">Every item Kinetix read, and why it was kept or filtered.</p>
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
          {["all", "kept", "noise"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 text-xs capitalize ${filter === f ? "bg-ink text-white" : "text-slate-600"}`}
            >
              {f}{" "}
              {f === "noise"
                ? `(${ws.stats.noiseFiltered})`
                : f === "kept"
                  ? `(${ws.stats.signalsProcessed - ws.stats.noiseFiltered})`
                  : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {list.map((s) => (
          <div key={s.id} className={`flex items-start gap-3 px-4 py-2.5 ${s.noise.isNoise ? "bg-slate-50/60" : ""}`}>
            <SourceBadge source={s.source} />
            <div className="min-w-0 flex-1">
              <div className={`truncate text-sm ${s.noise.isNoise ? "text-slate-400" : "text-slate-900"}`}>{s.title}</div>
              <div className="truncate text-xs text-slate-500">
                {s.author.name} · {formatDay(s.timestamp, ws.timezone)} {formatTime(s.timestamp, ws.timezone)} ·{" "}
                {s.body.replace(/\s+/g, " ").slice(0, 100)}
              </div>
            </div>
            <span
              className={`hidden shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] sm:flex ${
                s.noise.isNoise
                  ? "bg-slate-100 text-slate-500"
                  : /rescued/.test(s.noise.reason)
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-brand-50 text-brand-700"
              }`}
            >
              {s.noise.isNoise && <VolumeX className="h-3 w-3" />}
              {s.noise.reason}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
