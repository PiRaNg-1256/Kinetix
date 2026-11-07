// Slack via a user token (xoxp-) with search:read, users:read scopes.

import { ConnectorError, clip, fetchJson } from "./shared.js";

async function slack(method, params) {
  const res = await fetchJson("slack", `https://slack.com/api/${method}?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Bearer ${process.env.SLACK_USER_TOKEN}` },
  });
  if (!res.ok) throw new ConnectorError("slack", `${method}: ${res.error}`);
  return res;
}

export const slackConnector = {
  id: "slack",
  name: "Slack",
  isConfigured: () => Boolean(process.env.SLACK_USER_TOKEN),
  setupHint: "Set SLACK_USER_TOKEN (a user token with search:read and users:read).",
  async fetch(ctx) {
    const auth = await slack("auth.test", {});
    const since = new Date(ctx.now.getTime() - ctx.lookbackDays * 86_400_000).toISOString().slice(0, 10);
    const search = await slack("search.messages", {
      query: `after:${since}`,
      count: "80",
      sort: "timestamp",
      sort_dir: "desc",
    });

    // Resolve user ids to names for authors and mentions.
    const ids = new Set();
    for (const m of search.messages?.matches ?? []) {
      if (m.user) ids.add(m.user);
      for (const id of m.text.matchAll(/<@([A-Z0-9]+)>/g)) ids.add(id[1]);
    }
    const names = new Map();
    await Promise.all(
      Array.from(ids)
        .slice(0, 60)
        .map(async (id) => {
          try {
            const u = await slack("users.info", { user: id });
            names.set(id, { name: u.user.real_name || u.user.name, email: u.user.profile?.email, bot: u.user.is_bot });
          } catch {
            /* users:read missing — fall back to ids */
          }
        }),
    );

    const signals = (search.messages?.matches ?? []).map((m) => {
      const who = m.user ? names.get(m.user) : undefined;
      const isSelf = m.user === auth.user_id;
      const text = m.text
        .replace(/<@([A-Z0-9]+)>/g, (_, id) =>
          id === auth.user_id ? `@${ctx.user.handle ?? ctx.user.name.split(" ")[0]}` : `@${names.get(id)?.name ?? id}`,
        )
        .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2")
        .replace(/<(https?:[^>]+)>/g, "$1");
      const isDM = Boolean(m.channel?.is_im || m.channel?.is_mpim);
      const channel = isDM ? "DM" : `#${m.channel?.name ?? "channel"}`;
      return {
        id: `slack-${m.channel?.id}-${m.ts}`,
        source: "slack",
        kind: "message",
        title: isDM ? `DM with ${who?.name ?? m.username ?? "someone"}` : channel,
        body: clip(text, 2000),
        author: isSelf
          ? ctx.user
          : ctx.classify({
              name: who?.name ?? m.username ?? "Unknown",
              email: who?.email,
              handle: m.username,
              relationship: who?.bot ? "automated" : undefined,
            }),
        timestamp: new Date(Number(m.ts) * 1000).toISOString(),
        url: m.permalink,
        channel,
        threadId: isDM ? `slack-dm-${m.channel?.id}` : undefined,
        meta: { isDM, mentionsMe: m.text.includes(`<@${auth.user_id}>`) },
      };
    });
    return { signals };
  },
};
