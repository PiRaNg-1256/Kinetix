// Agent tests. The Claude path runs against a local fake of the Messages API (streaming), so
// the real agent loop — request shape, streaming, tool execution, error handling — is exercised
// without an API key or network access.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { loadDemoWorkspace } from "../src/lib/source.js";
import { applyOverrides, runTool } from "../src/lib/agent/tools.js";
import { describeClaudeError, runClaudeAgent } from "../src/lib/agent/claude.js";

const TUESDAY = new Date("2026-11-10T15:00:00Z");

// ───────────────────────── Fake Claude server ─────────────────────────

let server;
let requests = [];
let scenario = "tools";
const savedEnv = {};

function sse(res, events) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

const start = (id) => ({
  type: "message_start",
  message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } },
});
const text = (index, value) => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index, delta: { type: "text_delta", text: value } },
  { type: "content_block_stop", index },
];
const end = (stop_reason) => [
  { type: "message_delta", delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 20 } },
  { type: "message_stop" },
];

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
      if (scenario === "auth") {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
        return;
      }
      if (scenario === "refusal") return sse(res, [start("msg_r"), ...end("refusal")]);
      if (requests.length === 1) {
        // First turn: say something, then call a tool.
        return sse(res, [
          start("msg_1"),
          ...text(0, "Checking your day."),
          { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_1", name: "get_daily_briefing", input: {} } },
          { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } },
          { type: "content_block_stop", index: 1 },
          ...end("tool_use"),
        ]);
      }
      return sse(res, [start("msg_2"), ...text(0, "Your top priority is unblocking ATL-412."), ...end("end_turn")]);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  for (const k of ["ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) savedEnv[k] = process.env[k];
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.ANTHROPIC_AUTH_TOKEN;
});

after(() => {
  server?.close();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function run(question) {
  requests = [];
  const events = [];
  const ws = applyOverrides(loadDemoWorkspace(TUESDAY), {});
  await runClaudeAgent(ws, [{ role: "user", content: question }], (e) => events.push(e));
  return events;
}

// ───────────────────────────── Tests ─────────────────────────────

test("Claude agent: streams text, runs the tool Claude asks for, and sends the result back", async () => {
  scenario = "tools";
  const events = await run("What should I focus on today?");

  // What we asked Claude for.
  assert.equal(requests.length, 2);
  const first = requests[0];
  assert.match(first.url, /\/v1\/messages/);
  // SDK 1.x sends the key as a bearer token; older versions used x-api-key.
  assert.ok(first.headers.authorization === "Bearer test-key" || first.headers["x-api-key"] === "test-key");
  assert.match(first.headers["anthropic-beta"], /server-side-fallback-2026-07-01/);
  assert.equal(first.body.model, "claude-opus-5-5");
  assert.equal(first.body.stream, true);
  assert.equal(first.body.fallbacks, "default");
  assert.deepEqual(first.body.thinking, { type: "adaptive" });
  assert.equal(first.body.output_config.effort, "medium");
  assert.equal(first.body.tools.length, 9);
  assert.ok(first.body.tools.every((t) => t.eager_input_streaming === true && t.input_schema.type === "object"));
  assert.match(first.body.system.map((b) => b.text).join("\n"), /Jordan Lee/);

  // The tool result went back to Claude in the second request.
  const last = requests[1].body.messages.at(-1);
  assert.equal(last.role, "user");
  assert.equal(last.content[0].type, "tool_result");
  assert.equal(last.content[0].tool_use_id, "toolu_1");
  const result = JSON.parse(last.content[0].content);
  assert.ok(result.focus_now.length >= 3);

  // What the browser receives.
  const streamed = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  assert.match(streamed, /Checking your day\./);
  assert.match(streamed, /Your top priority is unblocking ATL-412\./);
  const tool = events.find((e) => e.type === "tool");
  assert.equal(tool.name, "get_daily_briefing");
  assert.match(events.find((e) => e.type === "tool_done").summary, /open tasks/);
});

test("Claude agent: a rejected API key surfaces a clear error (the chat route then falls back offline)", async () => {
  scenario = "auth";
  await assert.rejects(run("hi"), (err) => {
    assert.equal(describeClaudeError(err), "The Anthropic API key was rejected.");
    return true;
  });
});

test("Claude agent: a refusal stops the turn with a notice instead of running tools", async () => {
  scenario = "refusal";
  const events = await run("hi");
  assert.equal(requests.length, 1);
  assert.ok(events.some((e) => e.type === "notice" && /declined/.test(e.message)));
  assert.ok(!events.some((e) => e.type === "tool"));
});

test("update_task changes only the current request, never the shared snapshot", async () => {
  const shared = loadDemoWorkspace(TUESDAY); // stands in for the cached live snapshot
  const request = applyOverrides(shared, {});
  const events = [];
  const r = await runTool("update_task", { task_id: "task-jira-atl-412", status: "done" }, { ws: request, emit: (e) => events.push(e) });
  assert.equal(r.ok, true);
  assert.equal(request.tasks.find((t) => t.id === "task-jira-atl-412").status, "done");
  assert.equal(shared.tasks.find((t) => t.id === "task-jira-atl-412").status, "open");
  assert.deepEqual(events, [{ type: "task_update", taskId: "task-jira-atl-412", status: "done" }]);
});
