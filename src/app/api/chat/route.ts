import { type NextRequest } from "next/server";
import { z } from "zod";
import { AUTH_COOKIE, isAuthorized } from "@/lib/auth";
import { loadWorkspace } from "@/lib/source";
import { hasAnthropicKey, MODEL } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";
import { applyOverrides, type AgentEvent } from "@/lib/agent/tools";
import { describeClaudeError, runClaudeAgent } from "@/lib/agent/claude";
import { runOfflineAgent } from "@/lib/agent/offline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  mode: z.enum(["demo", "live"]),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(40),
  overrides: z.record(z.string(), z.object({ status: z.enum(["done", "snoozed", "open"]).optional(), pinned: z.boolean().optional() })).optional(),
  engine: z.enum(["auto", "offline"]).optional(),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { mode, overrides, engine } = parsed.data;
  // Keep the last 12 turns and make sure the conversation starts with a user turn.
  let messages = parsed.data.messages.slice(-12);
  while (messages.length && messages[0].role !== "user") messages = messages.slice(1);
  if (!messages.length || messages.at(-1)!.role !== "user" || messages.at(-1)!.content.length > 2000) {
    return Response.json({ error: "Invalid conversation" }, { status: 400 });
  }

  if (mode === "live" && !isAuthorized(req.cookies.get(AUTH_COOKIE)?.value)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const demoClaude = process.env.KINETIX_DEMO_USE_CLAUDE !== "false";
  const useClaude = engine !== "offline" && hasAnthropicKey() && (mode === "live" || demoClaude);
  if (mode === "demo" && useClaude) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const limit = Number(process.env.KINETIX_DEMO_RATE_LIMIT ?? 30);
    const rl = rateLimit(`chat:${ip}`, limit, 60 * 60_000);
    if (!rl.ok) {
      return Response.json({ error: `Demo limit reached (${limit} questions/hour). Try again in ${Math.ceil(rl.retryAfter / 60)} min.` }, { status: 429 });
    }
  }

  const ws = applyOverrides(await loadWorkspace(mode), overrides);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sentText = false;
      const emit = (e: AgentEvent) => {
        if (e.type === "text" && e.delta.trim()) sentText = true;
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        if (useClaude) {
          try {
            await runClaudeAgent(ws, messages, emit);
            emit({ type: "done", engine: "claude", model: MODEL });
          } catch (err) {
            console.error("Claude agent failed", err);
            if (sentText) throw err;
            emit({ type: "notice", message: `${describeClaudeError(err)} Answering with the offline engine instead.` });
            await runOfflineAgent(ws, messages, emit);
            emit({ type: "done", engine: "offline" });
          }
        } else {
          await runOfflineAgent(ws, messages, emit);
          emit({ type: "done", engine: "offline" });
        }
      } catch (err) {
        emit({ type: "error", message: describeClaudeError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
