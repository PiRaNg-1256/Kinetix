import { calendarConnector, gmailConnector } from "./google.js";
import { slackConnector } from "./slack.js";
import { notionConnector } from "./notion.js";
import { jiraConnector } from "./jira.js";
import { linearConnector } from "./linear.js";

export const CONNECTORS = [gmailConnector, slackConnector, calendarConnector, notionConnector, jiraConnector, linearConnector];
