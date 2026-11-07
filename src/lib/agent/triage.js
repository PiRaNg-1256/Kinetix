// Optional Claude pass over real email/Slack traffic. Rule-based extraction is fine for clean
// text, but real inboxes are messy; when an API key is present, Claude extracts the asks.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { findPerson } from "../engine/extract.js";
import { quotedPhrases } from "../engine/text.js";
import { MODEL } from "../config.js";

const Triage = z.object({
  action_items: z.array(
    z.object({
      signal_ids: z.array(z.string()).describe("ids of the messages this action item comes from"),
      title: z.string().describe("imperative, specific, under 90 characters, e.g. 'Send Dana the Q4 product section'"),
      kind: z.enum(["reply", "deliver", "review", "decide", "follow_up", "unblock"]),
      requester: z.string().nullable().describe("full name of the person asking, or null"),
      due_iso: z.string().nullable().describe("ISO-8601 deadline if one is stated or clearly implied, else null"),
      already_handled: z.boolean().describe("true if a later message from the user shows it is done"),
    }),
  ),
});

export async function triageWithClaude(signals, ctx) {
  const client = new Anthropic();
  const items = signals
    .filter((s) => s.kind === "email" || s.kind === "message")
    .slice(0, 80)
    .map((s) => ({
      id: s.id,
      source: s.source,
      from: s.author.name,
      from_relationship: s.author.relationship,
      to: s.meta.to,
      dm: s.meta.isDM,
      channel: s.channel,
      thread: s.threadId,
      sent: s.timestamp,
      subject: s.title,
      text: s.body.slice(0, 1200),
    }));
  if (items.length === 0) return [];

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(Triage) },
    system:
      `You triage workplace messages for ${ctx.user.name}${ctx.user.role ? ` (${ctx.user.role})` : ""}. ` +
      `Extract only concrete things ${ctx.user.name.split(" ")[0]} personally needs to do: direct requests, questions awaiting their answer, decisions they own. ` +
      `Skip FYIs, newsletters, automated notifications without a direct ask, and requests addressed to someone else. ` +
      `Merge duplicate asks across messages into one item. Resolve relative dates against each message's sent time in ${ctx.timezone}. ` +
      `The current time is ${ctx.now.toISOString()}.`,
    messages: [{ role: "user", content: `Messages (JSON):\n${JSON.stringify(items)}` }],
  });
  const parsed = response.parsed_output;
  if (!parsed) return [];

  const byId = new Map(signals.map((s) => [s.id, s]));
  return parsed.action_items
    .filter((a) => !a.already_handled)
    .map((a, i) => {
      const sources = a.signal_ids.map((id) => byId.get(id)).filter((s) => Boolean(s));
      if (sources.length === 0) return undefined;
      const first = sources[0];
      const requester =
        findPerson(ctx.people, a.requester ?? undefined) ??
        (a.requester ? sources.find((s) => s.author.name === a.requester)?.author : first.author);
      const due = a.due_iso && !Number.isNaN(Date.parse(a.due_iso)) ? new Date(a.due_iso).toISOString() : undefined;
      return {
        id: `task-ai-${first.id}-${i}`,
        title: a.title,
        detail: sources.map((s) => `${s.author.name}: ${s.body.slice(0, 200)}`).join("\n"),
        requester,
        due,
        projectId: first.projectId,
        signalIds: sources.map((s) => s.id),
        sources: Array.from(new Set(sources.map((s) => s.source))),
        kind: a.kind,
        priorityHint: requester?.relationship === "exec" || requester?.relationship === "customer" ? 0.7 : 0.5,
        threadId: first.threadId,
        quoted: quotedPhrases(a.title),
        createdAt: first.timestamp,
        reasons: ["Extracted by Claude"],
        context: sources.map((s) => `${s.title}\n${s.body}`).join("\n"),
      };
    })
    .filter((c) => Boolean(c));
}
