# Kinetix — an autonomous AI chief of staff

Kinetix connects to **Gmail, Slack, Google Calendar, Notion, Jira and Linear**, filters out the noise, and keeps a **self-managing, prioritized to-do list**. Ask it to **prepare you for a meeting**, **draft a follow-up**, **track project risks**, or **surface action items**. It shows every step it takes and cites its sources.

- **`/demo`** is a showcase workspace for a fictional startup (Quillon): 58 signals across all six tools, a launch at risk, and a customer renewal on the line. It works with **no setup and no API key**.
- **`/app`** is live mode. It reads your real tools using tokens you configure, and an access key locks it.

---

## What it does

| Capability | How it works |
|---|---|
| **Noise filtering** | Explainable rules mark promos, bot notifications, watcher-only ticket updates, declined events and social chatter as noise, with a reason for each. Notifications that carry a direct @-mention or an "action required" ask are rescued. The **Signals** tab shows every decision. |
| **Action-item extraction** | Pulls asks out of emails, DMs and @-mentions ("can you…", "I need a decision on…"), action-item lines in meeting notes, tickets assigned to you, blocked tickets on critical projects, and meetings that need prep. Parses deadlines like "by 11am", "before the go/no-go" and "by Friday, Nov 13" in your timezone and skips weekends. |
| **Prioritization** | Each task gets a score from 0 to 100. The score weighs urgency (deadline, how long it has been blocked or unanswered), who is asking (exec, customer, peer), project stakes, explicit ticket priority, and corroboration (the same ask showing up in several tools). Every task lists the reasons behind its rank. "Now" holds at most 5 tasks, plus anything due within 4 hours. |
| **Self-managing** | Duplicate asks across tools are merged: the demo's "skip tour" decision appears in Slack, Figma, Linear and Notion and becomes one task. A task closes itself when its ticket moves to Done or you reply later in the same thread. You can complete, snooze and reopen tasks; those edits persist in the browser. |
| **Meeting prep** | Gathers attendees with their latest messages, related emails, docs and tickets, the questions attendees have asked, open loops with that group, risks, and talking points. |
| **Follow-up drafts** | Builds recaps from the meeting's notes doc (decisions, owners, next steps) and replies grounded in live ticket status. In live mode drafts are saved to Gmail Drafts. **Nothing is ever sent.** |
| **Risk radar** | Detects blocked work, people going out of office while they own critical work, launch-readiness gaps, customer escalation language, overdue commitments, unanswered questions from important people, and compliance deadlines with repeated follow-ups. Each risk includes evidence and a mitigation. |

### Two reasoning engines

1. **Claude agent** (when `ANTHROPIC_API_KEY` is set). Claude runs a tool-use loop over the processed workspace with 9 tools: briefing, tasks, search, full thread, calendar, meeting brief, risks, save draft, update task. Responses stream to the browser with each tool step visible. It uses `claude-opus-5-5` with adaptive thinking and server-side refusal fallback (`fallbacks: "default"`). Tool inputs are validated with Zod before they run. In live mode, Claude also triages real email and Slack traffic into action items, because real inboxes are messier than rules can handle.
2. **Offline engine** (no key, or as an automatic fallback if the API errors). It answers the core requests (catch me up, focus, meeting prep, follow-up, reply, risks, mark done, search) using the same tools and data. This keeps the public demo free and reliable.

---

## Architecture

```
src/
  lib/
    connectors/      Gmail, Calendar (Google OAuth), Slack, Notion, Jira, Linear → normalized Signals
    engine/
      noise.ts       explainable noise filter
      extract.ts     asks → task candidates (+ auto-close detection)
      deadline.ts    natural-language deadlines, timezone + weekend aware
      prioritize.ts  merge duplicates across tools, score, bucket
      risks.ts       risk detectors with evidence
      brief.ts       meeting briefs
      drafts.ts      template drafts (offline engine)
      workspace.ts   pipeline orchestration → WorkspaceSnapshot
    agent/
      tools.ts       tool schemas + executors shared by both engines
      claude.ts      streaming Claude tool-use loop
      offline.ts     rule-based agent
      triage.ts      Claude structured-output triage for live data
    demo/data.ts     the fictional Quillon workspace (dates generated relative to today)
    source.ts        load demo/live snapshots (live is cached for 2 min)
    auth.ts          access-key auth for live mode
  app/
    page.tsx         landing page
    demo/            demo dashboard
    app/             live dashboard + setup guide + login
    api/workspace    GET snapshot
    api/chat         POST → NDJSON stream of agent events
    api/auth         unlock / lock live mode
tests/engine.test.ts
```

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, `@anthropic-ai/sdk`, Zod. No database. Snapshots are computed on request, and task edits live in the browser's localStorage.

---

## Run locally

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000/demo. To use Claude, put `ANTHROPIC_API_KEY=...` in `.env.local`.

```bash
npm test
```

The tests cover noise filtering, cross-tool merging, auto-close, deadline parsing, and risk detection. They also run the demo on every weekday and check it stays sane, and they test the offline agent.

---

## Deploy to Vercel

1. Import this repo in Vercel. No build settings are needed.
2. Optional: add `ANTHROPIC_API_KEY` so the demo chat is answered by Claude. The public demo is rate-limited per IP (`KINETIX_DEMO_RATE_LIMIT`, default 30 questions per hour). Set `KINETIX_DEMO_USE_CLAUDE=false` for zero API spend.
3. For live mode, add the variables from `.env.example`. At minimum you need `KINETIX_ACCESS_KEY`, your identity, and at least one connector.

The chat route allows up to 300 seconds per request (`maxDuration`) for multi-step agent turns.

---

## Connecting real tools

All connectors are read-only, except that Gmail can create drafts.

**Google (Gmail + Calendar)**
1. Google Cloud Console: create a project and enable the **Gmail API** and **Google Calendar API**.
2. Under OAuth consent screen, choose External, add yourself as a test user, and add the scopes `gmail.readonly`, `gmail.compose` and `calendar.readonly`.
3. Create an **OAuth client ID** (Web application) and add `https://developers.google.com/oauthplayground` as a redirect URI.
4. In the [OAuth Playground](https://developers.google.com/oauthplayground), open the gear icon, choose "Use your own OAuth credentials", authorize the three scopes, and exchange the code for tokens. Copy the **refresh token**.
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REFRESH_TOKEN`.
   > Refresh tokens for apps in "Testing" status expire after 7 days. For long-term use, publish the app. Gmail scopes are restricted, so Google requires verification for apps used by other people.

**Slack.** Create an app at api.slack.com/apps. Add the user token scopes `search:read` and `users:read`, install it to your workspace, and copy the **User OAuth Token** (`xoxp-…`) into `SLACK_USER_TOKEN`.

**Notion.** Create an internal integration at notion.so/my-integrations and copy the secret into `NOTION_TOKEN`. Then share the relevant pages or teamspaces with the integration (••• → Connections).

**Jira Cloud.** Create an API token at id.atlassian.com → Security. Set `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN`. `JIRA_JQL` is optional and overrides which issues are pulled.

**Linear.** Settings → Security & access → Personal API keys. Copy the key into `LINEAR_API_KEY`.

**Tuning.** `KINETIX_VIPS` (people whose asks rank highest), `KINETIX_CUSTOMER_DOMAINS` (email domains treated as customers), and `KINETIX_PROJECTS` (JSON list of projects with keywords, criticality and target date) make prioritization and risk detection much sharper.

---

## Security notes

- Live mode is **off unless `KINETIX_ACCESS_KEY` is set**. The cookie stores a SHA-256 of the key, never the key itself. Login attempts are rate-limited.
- All tokens live in server-side env vars and are never sent to the browser.
- The agent can only read data, save drafts, and change task status. It cannot send email or post messages. This deliberately limits the damage a prompt injection hidden in an email could do.
- The demo's rate limiter runs in memory per server instance. Treat it as a speed bump, not a hard spending cap. Set a spend limit on your Anthropic key.

## Limitations

These are known gaps, not hidden ones.

- **Single user.** Configuration is env-var based. Multi-user SaaS needs OAuth sign-in per user, a database for tokens and task state, and background sync jobs. The connector and engine layers are written to support that, but it isn't built yet.
- **Rules work best on clean text.** The rule-based extractor is tuned for clear asks. On real, messy inboxes, enable Claude triage (set `ANTHROPIC_API_KEY`), which handles phrasing the rules miss.
- **Pull, not push.** Data is fetched when you open or refresh the dashboard (cached for 2 minutes). There are no webhooks or scheduled sync yet.
- **Task edits are per browser.** Completing or snoozing a task is stored in localStorage, not synced across devices.
