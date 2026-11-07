// Linear via a personal API key (GraphQL).

import { ConnectorError, clip, fetchJson, isoDaysAgo } from "./shared.js";

const PRIORITY = { 0: "none", 1: "urgent", 2: "high", 3: "medium", 4: "low" };

const ISSUE_FIELDS = `identifier title description priority dueDate url updatedAt startedAt
  state { name type } assignee { id name } creator { id name } team { key }`;

export const linearConnector = {
  id: "linear",
  name: "Linear",
  isConfigured: () => Boolean(process.env.LINEAR_API_KEY),
  setupHint: "Set LINEAR_API_KEY (Settings → Security & access → Personal API keys).",
  async fetch(ctx) {
    const since = isoDaysAgo(ctx.now, ctx.lookbackDays * 2);
    const query = `query Kinetix($since: DateTimeOrDuration!) {
      viewer {
        id name
        assignedIssues(first: 50, filter: { updatedAt: { gt: $since } }) { nodes { ${ISSUE_FIELDS} } }
        createdIssues(first: 30, filter: { updatedAt: { gt: $since } }) { nodes { ${ISSUE_FIELDS} } }
      }
    }`;
    const res = await fetchJson("linear", "https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: process.env.LINEAR_API_KEY ?? "", "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { since } }),
    });
    if (res.errors?.length || !res.data) throw new ConnectorError("linear", res.errors?.map((e) => e.message).join("; ") ?? "No data");
    const viewer = res.data.viewer;
    const seen = new Set();
    const all = [...viewer.assignedIssues.nodes, ...viewer.createdIssues.nodes].filter(
      (i) => !seen.has(i.identifier) && seen.add(i.identifier),
    );
    const nameOf = (u) => (u ? (u.id === viewer.id ? ctx.user.name : u.name) : undefined);
    const signals = all.map((i) => {
      const done = i.state?.type === "completed" || i.state?.type === "canceled";
      return {
        id: `linear-${i.identifier}`,
        source: "linear",
        kind: "issue",
        title: `${i.identifier} ${i.title}`,
        body: clip(i.description ?? i.title, 2000),
        author: i.creator?.id === viewer.id ? ctx.user : ctx.classify({ name: i.creator?.name ?? "Linear" }),
        timestamp: i.updatedAt,
        url: i.url,
        channel: i.team?.key,
        meta: {
          key: i.identifier,
          status: done ? "Done" : i.state?.name,
          priority: PRIORITY[i.priority] ?? "none",
          assignee: nameOf(i.assignee),
          reporter: nameOf(i.creator),
          dueDate: i.dueDate ? `${i.dueDate}T17:00:00Z` : undefined,
          statusSince: i.startedAt ?? undefined,
        },
      };
    });
    return { signals };
  },
};
