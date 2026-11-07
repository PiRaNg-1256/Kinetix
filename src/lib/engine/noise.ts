// Noise filter: decides which signals deserve attention. Rules are deliberately explainable —
// every verdict carries a human-readable reason that the UI shows.

import type { NoiseVerdict, Person, Signal } from "../types.ts";
import { containsAny } from "./text.ts";

const AUTOMATED_SENDER = /(no-?reply|notifications?|notify|digest|newsletter|mailer|concierge|bot\b|-bot|automation|hello@|marketing@)/i;
const SOCIAL_CHANNELS = /^#(random|social|general|fun|watercooler|pets|music|food|kudos|announcements-social)$/i;
const PROMO_LABELS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"];
const TRANSACTIONAL_ASK = ["action required", "please submit", "please approve", "approval needed", "awaiting your", "sign the", "signature required"];
const FYI_ONLY = ["no action needed", "no action required", "you are receiving this because", "you are watching", "upgrade to premium", "unsubscribe"];

export interface NoiseContext {
  user: Person;
  now: Date;
}

export function isAutomated(person: Person): boolean {
  if (person.relationship === "automated") return true;
  const id = `${person.email ?? ""} ${person.handle ?? ""} ${person.name}`;
  return AUTOMATED_SENDER.test(id);
}

export function mentionsUser(signal: Signal, user: Person): boolean {
  if (signal.meta.mentionsMe) return true;
  const first = user.name.split(" ")[0].toLowerCase();
  const body = signal.body.toLowerCase();
  return body.includes(`@${first}`) || (user.handle ? body.includes(`@${user.handle.toLowerCase()}`) : false);
}

export function addressedToUser(signal: Signal, user: Person): boolean {
  if (signal.meta.isDM || mentionsUser(signal, user)) return true;
  const email = user.email?.toLowerCase();
  if (!email) return false;
  return (signal.meta.to ?? []).some((t) => t?.toLowerCase() === email);
}

export function classifyNoise(signal: Signal, ctx: NoiseContext): NoiseVerdict {
  const { user } = ctx;
  const text = `${signal.title}\n${signal.body}`;
  const automated = isAutomated(signal.author);
  const fromSelf = signal.author.email && user.email && signal.author.email.toLowerCase() === user.email.toLowerCase();

  // Things the user wrote are context, not noise (they power auto-closing).
  if (fromSelf && signal.kind !== "issue" && signal.kind !== "event") {
    return { isNoise: false, score: 0.1, reason: "Your own message — used to track what you've already handled" };
  }

  switch (signal.kind) {
    case "event": {
      if (signal.meta.responseStatus === "declined") return { isNoise: true, score: 0.9, reason: "You declined this event" };
      return { isNoise: false, score: 0.1, reason: "On your calendar" };
    }
    case "issue": {
      if (automated) return { isNoise: true, score: 0.85, reason: "Automated tracker update" };
      const mine = signal.meta.assignee === user.name || signal.meta.reporter === user.name;
      const pri = signal.meta.priority;
      if (!mine && (pri === "low" || pri === "none")) {
        return { isNoise: true, score: 0.75, reason: "Low-priority ticket you only watch" };
      }
      return { isNoise: false, score: 0.2, reason: mine ? "Assigned to or reported by you" : `${pri ?? "Tracked"}-priority work on a project you follow` };
    }
    case "doc": {
      if (signal.meta.isBotEdit || automated) return { isNoise: true, score: 0.85, reason: "Automated page edit" };
      return { isNoise: false, score: 0.25, reason: "Recently edited doc in your workspace" };
    }
    case "message": {
      if (automated) {
        return mentionsUser(signal, user)
          ? { isNoise: false, score: 0.4, reason: "Bot message, but it mentions you" }
          : { isNoise: true, score: 0.9, reason: "Bot / integration message" };
      }
      if (signal.meta.isDM) return { isNoise: false, score: 0.05, reason: "Direct message to you" };
      if (mentionsUser(signal, user)) return { isNoise: false, score: 0.1, reason: "You were @-mentioned" };
      if (signal.channel && SOCIAL_CHANNELS.test(signal.channel)) {
        return { isNoise: true, score: 0.85, reason: `Social chatter in ${signal.channel}` };
      }
      return { isNoise: false, score: 0.35, reason: `Discussion in ${signal.channel ?? "a channel"} you follow` };
    }
    case "email": {
      const labels = signal.meta.labels ?? [];
      if (automated) {
        // Notifications sometimes carry a direct ask (a Figma comment, an approval request).
        if (mentionsUser(signal, user)) return { isNoise: false, score: 0.35, reason: "Notification that contains a direct @-mention — rescued from noise" };
        if (containsAny(text, TRANSACTIONAL_ASK)) return { isNoise: false, score: 0.45, reason: "Automated, but asks you to act" };
        if (labels.some((l) => PROMO_LABELS.includes(l))) return { isNoise: true, score: 0.95, reason: "Promotional / social email" };
        if (containsAny(text, FYI_ONLY) || signal.meta.listUnsubscribe) return { isNoise: true, score: 0.9, reason: "Automated notification, nothing to do" };
        return { isNoise: true, score: 0.8, reason: "Automated sender" };
      }
      if (labels.some((l) => PROMO_LABELS.includes(l))) return { isNoise: true, score: 0.8, reason: "Filed under Promotions/Social" };
      const toMe = addressedToUser(signal, user);
      return { isNoise: false, score: toMe ? 0.1 : 0.3, reason: toMe ? "Sent directly to you" : "You were cc'd" };
    }
  }
}
