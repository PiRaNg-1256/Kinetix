// Core domain model shared by connectors, the processing engine, the agent and the UI.

export type SourceId = "gmail" | "slack" | "calendar" | "notion" | "jira" | "linear";

export type SignalKind = "email" | "message" | "event" | "doc" | "issue";

export interface Person {
  name: string;
  email?: string;
  handle?: string;
  role?: string;
  /** How much this person's asks should weigh, 0..1. 0 = automated sender. */
  weight?: number;
  relationship?: "self" | "exec" | "customer" | "report" | "peer" | "partner" | "vendor" | "automated";
}

export interface SignalMeta {
  // email
  unread?: boolean;
  labels?: string[];
  listUnsubscribe?: boolean;
  to?: string[];
  cc?: string[];
  // chat
  isDM?: boolean;
  mentionsMe?: boolean;
  // calendar
  start?: string;
  end?: string;
  attendees?: string[];
  organizer?: string;
  location?: string;
  responseStatus?: "accepted" | "declined" | "tentative" | "needsAction";
  isOutOfOffice?: boolean;
  // issues
  key?: string;
  status?: string;
  priority?: "urgent" | "high" | "medium" | "low" | "none";
  assignee?: string;
  reporter?: string;
  dueDate?: string;
  /** ISO date the issue entered its current status. */
  statusSince?: string;
  // docs
  lastEditedBy?: string;
  isBotEdit?: boolean;
}

/** A normalized unit of context from any connected tool. */
export interface Signal {
  id: string;
  source: SourceId;
  kind: SignalKind;
  title: string;
  body: string;
  author: Person;
  timestamp: string;
  url?: string;
  /** Slack channel, Gmail label, Jira/Linear project key, Notion workspace area. */
  channel?: string;
  /** Signals sharing a thread id are part of the same conversation. */
  threadId?: string;
  projectId?: string;
  meta: SignalMeta;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  targetDate?: string;
  owner?: string;
  /** 0..1 — how important this project is to the user right now. */
  criticality: number;
  keywords: string[];
}

export interface NoiseVerdict {
  isNoise: boolean;
  score: number;
  reason: string;
}

export type Bucket = "now" | "next" | "later";

export interface Task {
  id: string;
  title: string;
  detail: string;
  /** Person who asked, if any. */
  requester?: string;
  due?: string;
  projectId?: string;
  sourceSignalIds: string[];
  sources: SourceId[];
  score: number;
  bucket: Bucket;
  reasons: string[];
  status: "open" | "done" | "snoozed";
  /** Set when the engine closed the task by itself (e.g. the ticket was resolved). */
  autoClosedReason?: string;
  kind: "reply" | "deliver" | "review" | "prep" | "unblock" | "decide" | "follow_up";
}

export type Severity = "high" | "medium" | "low";

export interface Risk {
  id: string;
  title: string;
  severity: Severity;
  projectId?: string;
  summary: string;
  evidence: string[];
  mitigation: string;
  category: "blocked_work" | "schedule" | "customer" | "capacity" | "unanswered" | "compliance";
}

export interface MeetingBrief {
  eventId: string;
  title: string;
  start: string;
  end?: string;
  attendees: { name: string; role?: string; relationship?: string; recentContext?: string }[];
  purpose: string;
  context: { signalId: string; source: SourceId; title: string; snippet: string; timestamp: string }[];
  openTasks: { id: string; title: string; bucket: Bucket }[];
  risks: { id: string; title: string; severity: Severity }[];
  talkingPoints: string[];
  questions: string[];
}

export interface EmailDraft {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  /** Where the draft was saved, if anywhere. */
  savedTo?: "gmail" | "demo";
  id?: string;
}

export interface ConnectorStatus {
  id: SourceId;
  name: string;
  connected: boolean;
  mode: "demo" | "live" | "off";
  signalCount: number;
  error?: string;
  setupHint?: string;
}

export interface WorkspaceSnapshot {
  mode: "demo" | "live";
  generatedAt: string;
  /** "Now" for this workspace — frozen in demo mode so the scenario is reproducible. */
  now: string;
  timezone: string;
  user: Person;
  connectors: ConnectorStatus[];
  people: Person[];
  projects: Project[];
  signals: (Signal & { noise: NoiseVerdict })[];
  tasks: Task[];
  risks: Risk[];
  meetings: Signal[];
  stats: {
    signalsProcessed: number;
    noiseFiltered: number;
    openTasks: number;
    autoClosed: number;
    highRisks: number;
    meetingsToday: number;
  };
}

/** User-side edits to the task list, kept in the browser and sent with chat requests. */
export interface TaskOverride {
  status?: "done" | "snoozed" | "open";
  pinned?: boolean;
}
export type TaskOverrides = Record<string, TaskOverride>;
