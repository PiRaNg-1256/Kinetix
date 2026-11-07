import Link from "next/link";
import { ArrowRight, BellOff, CalendarClock, CheckCheck, ListTodo, Mail, ShieldAlert, Sparkles } from "lucide-react";
import { Logo, SOURCE_META } from "@/components/ui";

const FEATURES = [
  {
    Icon: BellOff,
    title: "Filters the noise",
    body: "Newsletters, bot pings, watcher updates and social chatter are set aside — with a reason for every call. Real asks hiding in notifications get rescued.",
  },
  {
    Icon: ListTodo,
    title: "A self-managing to-do list",
    body: "Asks from email, Slack, docs and tickets become ranked tasks. Duplicates across tools are merged; tasks close themselves when the ticket ships or you reply.",
  },
  {
    Icon: CalendarClock,
    title: "Meeting prep in seconds",
    body: "Who's in the room, what they've said lately, open questions, landmines and talking points — pulled from every tool before you walk in.",
  },
  {
    Icon: Mail,
    title: "Follow-ups, drafted",
    body: "Recaps built from your meeting notes and replies grounded in live ticket status — saved as drafts for you to review. Nothing is ever sent on its own.",
  },
  {
    Icon: ShieldAlert,
    title: "Project risk radar",
    body: "Blocked work, owners going out of office, readiness gaps, overdue commitments and unhappy customers — each with evidence and a mitigation.",
  },
  {
    Icon: CheckCheck,
    title: "Explainable by design",
    body: "Every rank shows why it's there. Every agent step is visible. Every claim cites its source.",
  },
];

const SOURCES = ["gmail", "slack", "calendar", "notion", "jira", "linear"];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="text-lg font-semibold tracking-tight">Kinetix</span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-slate-300">
            <Link href="/app" className="hover:text-white">
              Connect your tools
            </Link>
            <Link href="/demo" className="rounded-lg bg-white px-3 py-1.5 font-medium text-ink hover:bg-slate-100">
              Live demo
            </Link>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-14">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-brand-100" /> Autonomous AI chief of staff
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Your inbox, Slack, calendar, docs and tickets — turned into{" "}
            <span className="bg-gradient-to-r from-brand-100 to-violet-300 bg-clip-text text-transparent">one plan.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-300">
            Kinetix reads everything that lands on you, ignores what doesn't matter, and keeps a prioritized, self-managing to-do list. Ask
            it to prep you for a meeting, draft the follow-up, or tell you what's about to slip.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/demo"
              className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Try the live demo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/app" className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5">
              Connect your workspace
            </Link>
          </div>
          <div className="mt-12 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            <span className="mr-2">Connects to</span>
            {SOURCES.map((s) => {
              const M = SOURCE_META[s];
              return (
                <span key={s} className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-slate-200">
                  <M.Icon className="h-4 w-4" /> {M.label}
                </span>
              );
            })}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight">What it does all day</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 p-6">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <f.Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-5 text-sm sm:grid-cols-4">
            {[
              ["Ingest", "Connectors pull recent email, messages, events, pages and issues into one normalized feed."],
              ["Filter", "Explainable rules (and Claude, when enabled) separate signal from noise."],
              ["Prioritize", "Asks become tasks scored on deadline, who's asking, project stakes and corroboration."],
              ["Act", "The agent uses tools over that workspace to brief, draft, and flag risks — and shows its work."],
            ].map(([t, b], i) => (
              <li key={t} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-xs font-semibold text-brand-600">0{i + 1}</div>
                <div className="mt-1 font-semibold">{t}</div>
                <p className="mt-2 text-slate-600">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">See a busy morning handled</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          The demo drops you into the inbox of a Head of Product at a fictional startup — 58 signals, a launch at risk and a renewal on the
          line.
        </p>
        <Link
          href="/demo"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Open the demo <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-500">Kinetix · Built with Next.js and Claude</footer>
    </div>
  );
}
