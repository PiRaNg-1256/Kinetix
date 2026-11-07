"use client";

import { useState } from "react";
import { Lock, LoaderCircle } from "lucide-react";

export function LoginForm() {
  const [key, setKey] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        if (res.ok) window.location.reload();
        else {
          setError((await res.json().catch(() => ({}))).error ?? "Failed");
          setBusy(false);
        }
      }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-brand-500">
        <Lock className="h-4 w-4 text-slate-400" />
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Access key"
          className="flex-1 bg-transparent text-sm outline-none"
          autoFocus
        />
      </div>
      {error && <div className="text-xs text-rose-600">{error}</div>}
      <button
        disabled={busy || !key}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" />} Unlock live workspace
      </button>
    </form>
  );
}
