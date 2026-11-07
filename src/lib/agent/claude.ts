// The Claude-powered agent loop: streams text to the browser, executes tools against the
// workspace snapshot, and loops until Claude is done.

import Anthropic from "@anthropic-ai/sdk";
import type { WorkspaceSnapshot } from "../types.ts";
import { MODEL } from "../config.ts";
import { formatDay, formatTime } from "../time.ts";
import { runTool, toolDefinitions, toolLabel, type Emit } from "./tools.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_ITERATIONS = 10;

function systemPrompt(ws: WorkspaceSnapshot): Anthropic.Beta.BetaTextBlockParam[] {
  const stable = `You are Kinetix, an autonomous AI chief of staff. You work for one person and have read access to their workspace — Gmail, Slack, Google Calendar, Notion, Jira and Linear — already processed into a noise-filtered signal feed, a self-managing prioritized task list, and a project risk register. Your tools expose all of it.

How you work:
- Ground every claim in tool results. Never invent people, numbers, dates or commitments. If something isn't in the workspace, say so and suggest how to get it.
- Lead with the answer or recommendation, then the supporting detail. Be decisive: rank, recommend, and say what you would do. Flag tradeoffs plainly — don't sugarcoat bad news.
- Cite where facts come from in a compact form, e.g. "(Gmail · Olivia Grant)" or "(Jira ATL-412)".
- Use concise markdown: short headings, bullets, bold for the few things that matter. No filler.

Playbooks:
- "What should I focus on" / "catch me up": call get_daily_briefing, then give the top 3–5 moves in order with one line of why each, what can wait, and what was safely ignored.
- Meeting prep: call prepare_meeting_brief (and get_signal for anything you need in full). Produce: Objective · What they care about · Key context (3–5 bullets) · Talking points · Landmines/risks · Questions to ask · Asks you should make. Keep it scannable in 2 minutes.
- Follow-ups and replies: gather context first (prepare_meeting_brief, the notes doc, or get_signal on the thread), write the email in the user's voice — short, specific, owners and dates — then call save_email_draft. Never say an email was sent; drafts are for the user to review.
- Risks: call get_project_risks, group by project, rank by severity, and give a concrete mitigation and owner for each.
- When the user says something is done or asks to snooze it, call update_task.`;

  const context = `Context for this session:
- User: ${ws.user.name}${ws.user.role ? `, ${ws.user.role}` : ""}${ws.user.email ? ` <${ws.user.email}>` : ""}
- Current time: ${formatDay(ws.now, ws.timezone)} ${formatTime(ws.now, ws.timezone)} (${ws.timezone})
- Mode: ${ws.mode === "demo" ? "DEMO — a fictional company (Quillon) with sample data. Treat it as real for the purpose of the conversation." : "LIVE — real workspace data."}
- Projects: ${ws.projects.map((p) => `${p.name} [id: ${p.id}]`).join("; ") || "none configured"}`;

  return [
    { type: "text", text: stable },
    { type: "text", text: context },
  ];
}

export async function runClaudeAgent(ws: WorkspaceSnapshot, history: ChatTurn[], emit: Emit): Promise<void> {
  const client = new Anthropic();
  const tools = toolDefinitions();
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));
  let jsonRetries = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system: systemPrompt(ws),
      tools,
      messages,
    });
    stream.on("text", (delta) => emit({ type: "text", delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming, unparseable tool JSON rejects here; retry that turn only.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === "refusal") {
      emit({ type: "notice", message: "Claude declined to continue this request." });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0) return;
    if (message.stop_reason === "tool_use" && toolUses.length === 0) return;

    messages.push({ role: "assistant", content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of toolUses) {
      emit({ type: "tool", id: use.id, name: use.name, label: toolLabel(use.name, use.input) });
      try {
        const r = await runTool(use.name, use.input, { ws, emit });
        emit({ type: "tool_done", id: use.id, summary: r.summary });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(r.result), is_error: !r.ok });
      } catch (err) {
        emit({ type: "tool_done", id: use.id, summary: "failed" });
        results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
    // Visually separate post-tool text from pre-tool text.
    emit({ type: "text", delta: "\n\n" });
  }
  emit({ type: "notice", message: "Stopped after the maximum number of tool steps." });
}

export function describeClaudeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This API key doesn't have access to the configured model.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate-limited right now.";
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API.";
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "unknown"}).`;
  return err instanceof Error ? err.message : String(err);
}
