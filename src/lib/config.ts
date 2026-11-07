// Environment-driven configuration for live mode. Everything is optional except the user's
// identity; see .env.example for documentation.

import type { Person, Project } from "./types.ts";

export const MODEL = process.env.KINETIX_MODEL ?? "claude-opus-5-5";

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function liveUser(): Person {
  const name = process.env.KINETIX_USER_NAME ?? "You";
  return {
    name,
    email: process.env.KINETIX_USER_EMAIL?.toLowerCase(),
    handle: process.env.KINETIX_USER_HANDLE ?? name.split(" ")[0].toLowerCase(),
    role: process.env.KINETIX_USER_ROLE,
    relationship: "self",
    weight: 1,
  };
}

export function liveTimezone(): string {
  return process.env.KINETIX_TIMEZONE ?? "UTC";
}

function list(env?: string): string[] {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Classifies people using KINETIX_VIPS (names/emails) and KINETIX_CUSTOMER_DOMAINS. */
export function personClassifier(user: Person): (p: Person) => Person {
  const vips = list(process.env.KINETIX_VIPS);
  const customerDomains = list(process.env.KINETIX_CUSTOMER_DOMAINS);
  const ownDomain = user.email?.split("@")[1];
  return (p: Person): Person => {
    if (p.relationship) return { weight: p.relationship === "automated" ? 0 : 0.5, ...p };
    const email = p.email?.toLowerCase() ?? "";
    const domain = email.split("@")[1];
    if (user.email && email === user.email) return { ...p, relationship: "self", weight: 1 };
    if (vips.includes(email) || vips.includes(p.name.toLowerCase())) return { ...p, relationship: "exec", weight: 0.95 };
    if (domain && customerDomains.includes(domain)) return { ...p, relationship: "customer", weight: 0.9 };
    if (domain && ownDomain && domain === ownDomain) return { ...p, relationship: "peer", weight: 0.6 };
    if (domain) return { ...p, relationship: "partner", weight: 0.5 };
    return { ...p, weight: 0.5 };
  };
}

/**
 * KINETIX_PROJECTS is a JSON array, e.g.
 * [{"id":"launch","name":"Q1 launch","keywords":["launch","ga"],"criticality":1,"targetDate":"2026-12-01"}]
 */
export function liveProjects(): Project[] {
  try {
    const raw = JSON.parse(process.env.KINETIX_PROJECTS ?? "[]") as Partial<Project>[];
    return raw
      .filter((p) => p.id && p.name)
      .map((p) => ({
        id: p.id!,
        name: p.name!,
        description: p.description ?? "",
        targetDate: p.targetDate ? new Date(p.targetDate).toISOString() : undefined,
        owner: p.owner,
        criticality: typeof p.criticality === "number" ? p.criticality : 0.7,
        keywords: (p.keywords ?? []).map((k) => k.toLowerCase()),
      }));
  } catch {
    return [];
  }
}
