// Notion via an internal integration token. Share the pages/databases you want Kinetix to read
// with the integration.

import { clip, fetchJson, mapLimit } from "./shared.js";

const NOTION_VERSION = "2022-06-28";

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function pageTitle(page) {
  for (const prop of Object.values(page.properties ?? {})) {
    if (prop.type === "title") return (prop.title ?? []).map((t) => t.plain_text ?? "").join("") || "Untitled";
  }
  return "Untitled";
}

function blockText(block) {
  const data = block[block.type];
  const text = (data?.rich_text ?? []).map((t) => t.plain_text ?? "").join("");
  if (!text) return "";
  switch (block.type) {
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return `\n${text}`;
    case "bulleted_list_item":
    case "numbered_list_item":
      return `- ${text}`;
    case "to_do":
      return `- [${data?.checked ? "x" : " "}] ${text}`;
    default:
      return text;
  }
}

export const notionConnector = {
  id: "notion",
  name: "Notion",
  isConfigured: () => Boolean(process.env.NOTION_TOKEN),
  setupHint: "Set NOTION_TOKEN (internal integration secret) and share relevant pages with the integration.",
  async fetch(ctx) {
    const search = await fetchJson("notion", "https://api.notion.com/v1/search", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        page_size: 25,
      }),
    });
    const cutoff = ctx.now.getTime() - ctx.lookbackDays * 86_400_000;
    const recent = search.results.filter((p) => new Date(p.last_edited_time).getTime() >= cutoff).slice(0, 15);
    const signals = await mapLimit(recent, 3, async (page) => {
      const blocks = await fetchJson("notion", `https://api.notion.com/v1/blocks/${page.id}/children?page_size=80`, {
        headers: headers(),
      }).catch(() => ({ results: [] }));
      const body = blocks.results.map(blockText).filter(Boolean).join("\n").trim();
      const isBot = page.last_edited_by?.object === "bot";
      return {
        id: `notion-${page.id}`,
        source: "notion",
        kind: "doc",
        title: pageTitle(page),
        body: clip(body, 3000),
        author: isBot ? { name: "Notion integration", relationship: "automated", weight: 0 } : { name: "Notion page", weight: 0.5 },
        timestamp: page.last_edited_time,
        url: page.url,
        channel: "Notion",
        meta: { isBotEdit: isBot },
      };
    });
    return { signals };
  },
};
