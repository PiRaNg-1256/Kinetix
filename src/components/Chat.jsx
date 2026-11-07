"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Check, Copy, LoaderCircle, Mail, Sparkles, TriangleAlert, X } from "lucide-react";

import { Markdown } from "./Markdown";

const SUGGESTIONS = [
  "What should I focus on today?",
  "Prepare me for the Brightline QBR",
  "What are the biggest risks to the Atlas launch?",
  "Draft a follow-up for yesterday's design review",
  "Reply to Olivia about the SSO issues",
  "Catch me up on what I missed",
];

// crypto.randomUUID only exists on https/localhost; fall back so plain-http dev on a LAN IP works.
const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function Chat({ mode, overrides, onTaskUpdate, engineLabel, registerSend, onClose, suggestions = SUGGESTIONS }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef(null);
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const update = (id, fn) => setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(
    async (text) => {
      const content = text.trim();
      if (!content || busy) return;
      setBusy(true);
      setInput("");
      const user = { id: uid(), role: "user", text: content, steps: [], drafts: [], notices: [] };
      const reply = { id: uid(), role: "assistant", text: "", steps: [], drafts: [], notices: [], pending: true };
      const history = [...messagesRef.current, user]
        .filter((m) => m.text.trim() && !m.error)
        .map((m) => ({ role: m.role, content: m.text }));
      setMessages((ms) => [...ms, user, reply]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, messages: history, overrides: overridesRef.current }),
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line);
            switch (e.type) {
              case "text":
                update(reply.id, (m) => ({ ...m, text: m.text + e.delta }));
                break;
              case "tool":
                update(reply.id, (m) => ({ ...m, steps: [...m.steps, { id: e.id, label: e.label }] }));
                break;
              case "tool_done":
                update(reply.id, (m) => ({ ...m, steps: m.steps.map((s) => (s.id === e.id ? { ...s, summary: e.summary } : s)) }));
                break;
              case "draft":
                update(reply.id, (m) => ({ ...m, drafts: [...m.drafts, e.draft] }));
                break;
              case "task_update":
                onTaskUpdate(e.taskId, e.status);
                break;
              case "notice":
                update(reply.id, (m) => ({ ...m, notices: [...m.notices, e.message] }));
                break;
              case "error":
                update(reply.id, (m) => ({ ...m, error: e.message }));
                break;
              case "done":
                update(reply.id, (m) => ({ ...m, engine: e.engine }));
                break;
            }
          }
        }
      } catch (err) {
        update(reply.id, (m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
      } finally {
        update(reply.id, (m) => ({ ...m, pending: false, text: m.text.trim() }));
        setBusy(false);
      }
    },
    [busy, mode, onTaskUpdate],
  );

  useEffect(() => {
    registerSend?.(send);
  }, [registerSend, send]);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Ask Kinetix</div>
            <div className="text-[11px] text-slate-500">{engineLabel}</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Close chat">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div ref={scroller} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">I've read your inbox, Slack, calendar, docs and tickets.</p>
              <p className="mt-1">
                Ask me to prep a meeting, draft a follow-up, explain a risk, or tell you what to do next. I'll show every step I take.
              </p>
            </div>
            <div className="space-y-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="group flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-brand-500 hover:bg-brand-50"
                >
                  {s}
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-sm text-white">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="space-y-2">
              {m.steps.length > 0 && (
                <div className="space-y-1">
                  {m.steps.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs text-slate-500">
                      {s.summary ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-brand-500" />
                      )}
                      <span className="font-medium text-slate-600">{s.label}</span>
                      {s.summary && <span className="text-slate-400">· {s.summary}</span>}
                    </div>
                  ))}
                </div>
              )}
              {m.notices.map((n, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {n}
                </div>
              ))}
              {m.drafts.map((d, i) => (
                <DraftCard key={i} draft={d} />
              ))}
              {(m.text || m.pending) && (
                <div className={m.pending && !m.text ? "flex items-center gap-2 text-xs text-slate-400" : ""}>
                  {m.text ? (
                    <div className={m.pending ? "kx-cursor" : ""}>
                      <Markdown text={m.text} />
                    </div>
                  ) : (
                    m.steps.length === 0 && (
                      <>
                        <Bot className="h-4 w-4 animate-pulse" /> Thinking…
                      </>
                    )
                  )}
                </div>
              )}
              {m.error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{m.error}</div>}
              {m.engine && !m.pending && (
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  {m.engine === "claude" ? "Answered by Claude" : "Answered by the offline engine"}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-slate-200 p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Prep me for…, draft a follow-up to…, what's at risk…"
            className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-brand-600 p-1.5 text-white transition hover:bg-brand-700 disabled:opacity-40"
            aria-label="Send"
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}

function DraftCard({ draft }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <Mail className="h-3.5 w-3.5 text-red-500" />
          {draft.savedTo === "gmail" ? "Saved to Gmail drafts — not sent" : "Draft for review — not sent"}
        </div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(`To: ${draft.to.join(", ")}\nSubject: ${draft.subject}\n\n${draft.body}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs text-slate-600">
        <div>
          <span className="text-slate-400">To:</span> {draft.to.join(", ")}
        </div>
        {draft.cc?.length ? (
          <div>
            <span className="text-slate-400">Cc:</span> {draft.cc.join(", ")}
          </div>
        ) : null}
        <div>
          <span className="text-slate-400">Subject:</span> <span className="font-medium text-slate-800">{draft.subject}</span>
        </div>
      </div>
      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-slate-200 bg-white px-3 py-2 font-sans text-[13px] leading-relaxed text-slate-800">
        {draft.body}
      </pre>
    </div>
  );
}
