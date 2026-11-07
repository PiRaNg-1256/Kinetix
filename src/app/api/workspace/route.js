import { NextResponse } from "next/server";
import { AUTH_COOKIE, isAuthorized } from "@/lib/auth";
import { loadWorkspace } from "@/lib/source";
import { hasAnthropicKey, MODEL } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req) {
  const mode = req.nextUrl.searchParams.get("mode") === "live" ? "live" : "demo";
  if (mode === "live" && !isAuthorized(req.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await loadWorkspace(mode, { force: req.nextUrl.searchParams.get("refresh") === "1" });
    const claude = hasAnthropicKey() && (mode === "live" || process.env.KINETIX_DEMO_USE_CLAUDE !== "false");
    return NextResponse.json(
      { ...snapshot, agent: { engine: claude ? "claude" : "offline", model: claude ? MODEL : null } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("workspace load failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load workspace" }, { status: 500 });
  }
}
