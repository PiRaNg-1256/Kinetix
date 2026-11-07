// Jira Cloud via email + API token (Basic auth). Uses the /rest/api/3/search/jql endpoint.

import { clip, fetchJson } from "./shared.js";

function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.text) return node.text;
  const inner = (node.content ?? []).map(adfToText).join(node.type === "paragraph" || node.type === "listItem" ? "" : "\n");
  return node.type === "paragraph" ? `${inner}\n` : inner;
}

function priorityOf(name) {
  const n = (name ?? "").toLowerCase();
  if (/highest|blocker|urgent/.test(n)) return "urgent";
  if (/high|critical|major/.test(n)) return "high";
  if (/medium|normal/.test(n)) return "medium";
  if (/low|minor|trivial/.test(n)) return "low";
  return "none";
}

export const jiraConnector = {
  id: "jira",
  name: "Jira",
  isConfigured: () => Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN),
  setupHint: "Set JIRA_BASE_URL (https://your-site.atlassian.net), JIRA_EMAIL and JIRA_API_TOKEN.",
  async fetch(ctx) {
    const base = (process.env.JIRA_BASE_URL ?? "").replace(/\/$/, "");
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
    const headers = { Authorization: `Basic ${auth}`, Accept: "application/json", "Content-Type": "application/json" };
    const me = await fetchJson("jira", `${base}/rest/api/3/myself`, { headers });
    const jql =
      process.env.JIRA_JQL ??
      `(assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()) AND updated >= -${ctx.lookbackDays * 2}d ORDER BY updated DESC`;
    const res = await fetchJson("jira", `${base}/rest/api/3/search/jql`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jql,
        maxResults: 60,
        fields: [
          "summary",
          "description",
          "status",
          "priority",
          "assignee",
          "reporter",
          "duedate",
          "updated",
          "statuscategorychangedate",
          "project",
          "labels",
        ],
      }),
    });
    const nameOf = (u) => (u ? (u.accountId === me.accountId ? ctx.user.name : u.displayName) : undefined);
    const signals = res.issues.map((i) => {
      const f = i.fields;
      const done = f.status?.statusCategory?.key === "done";
      return {
        id: `jira-${i.key}`,
        source: "jira",
        kind: "issue",
        title: `${i.key} ${f.summary}`,
        body: clip(adfToText(f.description).trim() || f.summary, 2000),
        author: f.reporter
          ? f.reporter.accountId === me.accountId
            ? ctx.user
            : ctx.classify({ name: f.reporter.displayName, email: f.reporter.emailAddress })
          : { name: "Jira" },
        timestamp: f.updated,
        url: `${base}/browse/${i.key}`,
        channel: f.project?.key,
        meta: {
          key: i.key,
          status: done ? "Done" : f.status?.name,
          priority: priorityOf(f.priority?.name),
          assignee: nameOf(f.assignee),
          reporter: nameOf(f.reporter),
          dueDate: f.duedate ? `${f.duedate}T17:00:00Z` : undefined,
          statusSince: f.statuscategorychangedate,
          labels: f.labels,
        },
      };
    });
    return { signals };
  },
};
