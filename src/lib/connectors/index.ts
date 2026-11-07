import type { Connector } from "./shared.ts";
import { calendarConnector, gmailConnector } from "./google.ts";
import { slackConnector } from "./slack.ts";
import { notionConnector } from "./notion.ts";
import { jiraConnector } from "./jira.ts";
import { linearConnector } from "./linear.ts";

export const CONNECTORS: Connector[] = [gmailConnector, slackConnector, calendarConnector, notionConnector, jiraConnector, linearConnector];

export type { Connector } from "./shared.ts";
