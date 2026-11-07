import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Dashboard } from "@/components/Dashboard";
import { LoginForm } from "@/components/LoginForm";
import { Logo, SOURCE_META } from "@/components/ui";
import { AUTH_COOKIE, isAuthorized, liveAccessEnabled } from "@/lib/auth";
import { CONNECTORS } from "@/lib/connectors";
import { hasAnthropicKey } from "@/lib/config";

export const metadata: Metadata = { title: "Kinetix — your workspace" };
export const dynamic = "force-dynamic";

export default async function AppPage() {
  const jar = await cookies();
  const authorized = isAuthorized(jar.get(AUTH_COOKIE)?.value);
  const anyConnector = CONNECTORS.some((c) => c.isConfigured());

  if (authorized && anyConnector) return <Dashboard mode="live" />;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-lg font-semibold">Kinetix</span>
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Connect your workspace</h1>
        <p className="mt-2 text-sm text-slate-600">
          Live mode reads your real tools, so it is configured with environment variables on your deployment (Vercel → Project → Settings → Environment Variables) and locked behind an access key. See the README for step-by-step token setup.
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">1. Access key {liveAccessEnabled() ? "✅" : "— required"}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Set <code className="rounded bg-slate-100 px-1">KINETIX_ACCESS_KEY</code> to a long random string (12+ characters). Without it, live mode stays disabled.
          </p>
          {liveAccessEnabled() && !authorized && (
            <div className="mt-4">
              <LoginForm />
            </div>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">2. Connectors</h2>
          <div className="mt-3 divide-y divide-slate-100">
            {CONNECTORS.map((c) => {
              const M = SOURCE_META[c.id];
              const on = c.isConfigured();
              return (
                <div key={c.id} className="flex items-start gap-3 py-2.5">
                  <M.Icon className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {c.name} {on ? <span className="text-xs font-normal text-emerald-600">configured</span> : <span className="text-xs font-normal text-slate-400">not configured</span>}
                    </div>
                    {!on && <div className="text-xs text-slate-500">{c.setupHint}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">3. Claude {hasAnthropicKey() ? "✅" : "— recommended"}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Set <code className="rounded bg-slate-100 px-1">ANTHROPIC_API_KEY</code> to let Claude triage real messages and power the chat. Without it, Kinetix uses its rule-based offline engine.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold">4. About you</h2>
          <p className="mt-1 text-sm text-slate-600">
            Set <code className="rounded bg-slate-100 px-1">KINETIX_USER_NAME</code>, <code className="rounded bg-slate-100 px-1">KINETIX_USER_EMAIL</code> and{" "}
            <code className="rounded bg-slate-100 px-1">KINETIX_TIMEZONE</code>. Optional: <code className="rounded bg-slate-100 px-1">KINETIX_VIPS</code>,{" "}
            <code className="rounded bg-slate-100 px-1">KINETIX_CUSTOMER_DOMAINS</code> and <code className="rounded bg-slate-100 px-1">KINETIX_PROJECTS</code> sharpen prioritization.
          </p>
        </div>

        {authorized && !anyConnector && <p className="mt-4 text-sm text-amber-700">You're unlocked, but no connectors are configured yet.</p>}

        <Link href="/demo" className="mt-8 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Or explore the demo workspace
        </Link>
      </div>
    </div>
  );
}
