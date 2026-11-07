import { CalendarDays, CircleDot, FileText, Mail, MessageSquare, Ticket } from "lucide-react";
import type { SourceId } from "@/lib/types";

export const SOURCE_META: Record<SourceId, { label: string; color: string; Icon: typeof Mail }> = {
  gmail: { label: "Gmail", color: "text-red-600 bg-red-50 ring-red-100", Icon: Mail },
  slack: { label: "Slack", color: "text-fuchsia-700 bg-fuchsia-50 ring-fuchsia-100", Icon: MessageSquare },
  calendar: { label: "Calendar", color: "text-blue-600 bg-blue-50 ring-blue-100", Icon: CalendarDays },
  notion: { label: "Notion", color: "text-slate-800 bg-slate-100 ring-slate-200", Icon: FileText },
  jira: { label: "Jira", color: "text-sky-700 bg-sky-50 ring-sky-100", Icon: Ticket },
  linear: { label: "Linear", color: "text-violet-700 bg-violet-50 ring-violet-100", Icon: CircleDot },
};

export function SourceBadge({ source, withLabel = false }: { source: SourceId; withLabel?: boolean }) {
  const m = SOURCE_META[source];
  return (
    <span title={m.label} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ${m.color}`}>
      <m.Icon className="h-3 w-3" />
      {withLabel && m.label}
    </span>
  );
}

export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="kxg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a5b4fc" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0b1020" />
      <path d="M20 14v36M20 32l18-18M24 30l16 20" stroke="url(#kxg)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function ScorePill({ score }: { score: number }) {
  const tone = score >= 80 ? "bg-rose-600 text-white" : score >= 65 ? "bg-amber-500 text-white" : score >= 50 ? "bg-sky-600 text-white" : "bg-slate-300 text-slate-700";
  return <span className={`inline-flex h-6 min-w-8 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums ${tone}`}>{score}</span>;
}

export function SeverityBadge({ severity }: { severity: "high" | "medium" | "low" }) {
  const tone =
    severity === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : severity === "medium" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-50 text-slate-600 ring-slate-200";
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${tone}`}>{severity}</span>;
}
