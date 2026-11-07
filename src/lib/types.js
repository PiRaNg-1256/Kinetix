// Core domain model shared by connectors, the processing engine, the agent and the UI.
//
// JavaScript has no static types, so the data shapes are documented here with JSDoc.
// Nothing imports this file at runtime; editors pick the types up from references like
// `/** @type {import("./types.js").Signal} */`.

/** @typedef {"gmail" | "slack" | "calendar" | "notion" | "jira" | "linear"} SourceId */

/** @typedef {"email" | "message" | "event" | "doc" | "issue"} SignalKind */

/**
 * @typedef {object} Person
 * @property {string} name
 * @property {string} [email]
 * @property {string} [handle]
 * @property {string} [role]
 * @property {number} [weight] How much this person's asks should weigh, 0..1. 0 = automated sender.
 * @property {"self" | "exec" | "customer" | "report" | "peer" | "partner" | "vendor" | "automated"} [relationship]
 */

/**
 * Source-specific details. Only the fields relevant to a signal's kind are set.
 * @typedef {object} SignalMeta
 * @property {boolean} [unread] email
 * @property {string[]} [labels] email
 * @property {boolean} [listUnsubscribe] email
 * @property {string[]} [to] email
 * @property {string[]} [cc] email
 * @property {boolean} [isDM] chat
 * @property {boolean} [mentionsMe] chat
 * @property {string} [start] calendar (ISO)
 * @property {string} [end] calendar (ISO)
 * @property {string[]} [attendees] calendar
 * @property {string} [organizer] calendar
 * @property {string} [location] calendar
 * @property {"accepted" | "declined" | "tentative" | "needsAction"} [responseStatus] calendar
 * @property {boolean} [isOutOfOffice] calendar
 * @property {string} [key] issues, e.g. "ATL-412"
 * @property {string} [status] issues
 * @property {"urgent" | "high" | "medium" | "low" | "none"} [priority] issues
 * @property {string} [assignee] issues
 * @property {string} [reporter] issues
 * @property {string} [dueDate] issues (ISO)
 * @property {string} [statusSince] issues — ISO date the issue entered its current status
 * @property {string} [lastEditedBy] docs
 * @property {boolean} [isBotEdit] docs
 */

/**
 * A normalized unit of context from any connected tool.
 * @typedef {object} Signal
 * @property {string} id
 * @property {SourceId} source
 * @property {SignalKind} kind
 * @property {string} title
 * @property {string} body
 * @property {Person} author
 * @property {string} timestamp ISO
 * @property {string} [url]
 * @property {string} [channel] Slack channel, Gmail label, Jira/Linear project key, Notion area.
 * @property {string} [threadId] Signals sharing a thread id are part of the same conversation.
 * @property {string} [projectId]
 * @property {SignalMeta} meta
 */

/**
 * @typedef {object} Project
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} [targetDate] ISO
 * @property {string} [owner]
 * @property {number} criticality 0..1 — how important this project is to the user right now.
 * @property {string[]} keywords
 */

/**
 * @typedef {object} NoiseVerdict
 * @property {boolean} isNoise
 * @property {number} score
 * @property {string} reason
 */

/** @typedef {"now" | "next" | "later"} Bucket */

/**
 * @typedef {object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} detail
 * @property {string} [requester] Person who asked, if any.
 * @property {string} [due] ISO
 * @property {string} [projectId]
 * @property {string[]} sourceSignalIds
 * @property {SourceId[]} sources
 * @property {number} score 0..100
 * @property {Bucket} bucket
 * @property {string[]} reasons Why the task is ranked where it is.
 * @property {"open" | "done" | "snoozed"} status
 * @property {string} [autoClosedReason] Set when the engine closed the task by itself.
 * @property {"reply" | "deliver" | "review" | "prep" | "unblock" | "decide" | "follow_up"} kind
 */

/** @typedef {"high" | "medium" | "low"} Severity */

/**
 * @typedef {object} Risk
 * @property {string} id
 * @property {string} title
 * @property {Severity} severity
 * @property {string} [projectId]
 * @property {string} summary
 * @property {string[]} evidence Signal ids.
 * @property {string} mitigation
 * @property {"blocked_work" | "schedule" | "customer" | "capacity" | "unanswered" | "compliance"} category
 */

/**
 * @typedef {object} MeetingBrief
 * @property {string} eventId
 * @property {string} title
 * @property {string} start
 * @property {string} [end]
 * @property {{ name: string, role?: string, relationship?: string, recentContext?: string }[]} attendees
 * @property {string} purpose
 * @property {{ signalId: string, source: SourceId, title: string, snippet: string, timestamp: string }[]} context
 * @property {{ id: string, title: string, bucket: Bucket }[]} openTasks
 * @property {{ id: string, title: string, severity: Severity }[]} risks
 * @property {string[]} talkingPoints
 * @property {string[]} questions
 */

/**
 * @typedef {object} EmailDraft
 * @property {string[]} to
 * @property {string[]} [cc]
 * @property {string} subject
 * @property {string} body
 * @property {"gmail" | "demo"} [savedTo] Where the draft was saved, if anywhere. Drafts are never sent.
 * @property {string} [id]
 */

/**
 * @typedef {object} ConnectorStatus
 * @property {SourceId} id
 * @property {string} name
 * @property {boolean} connected
 * @property {"demo" | "live" | "off"} mode
 * @property {number} signalCount
 * @property {string} [error]
 * @property {string} [setupHint]
 */

/**
 * Everything the UI and the agent see, produced by `buildSnapshot()`.
 * @typedef {object} WorkspaceSnapshot
 * @property {"demo" | "live"} mode
 * @property {string} generatedAt
 * @property {string} now "Now" for this workspace — frozen in demo mode so the scenario is reproducible.
 * @property {string} timezone
 * @property {Person} user
 * @property {ConnectorStatus[]} connectors
 * @property {Person[]} people
 * @property {Project[]} projects
 * @property {(Signal & { noise: NoiseVerdict })[]} signals
 * @property {Task[]} tasks
 * @property {Risk[]} risks
 * @property {Signal[]} meetings
 * @property {{ signalsProcessed: number, noiseFiltered: number, openTasks: number, autoClosed: number, highRisks: number, meetingsToday: number }} stats
 */

/**
 * User-side edits to the task list, kept in the browser and sent with chat requests.
 * @typedef {Record<string, { status?: "done" | "snoozed" | "open", pinned?: boolean }>} TaskOverrides
 */

export {};
