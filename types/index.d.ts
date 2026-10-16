export type Role = 'impl' | 'verify'
export type Status =
  | 'waiting' | 'ready' | 'implementing' | 'implemented' | 'verifying' | 'verified'
  | 'failed' | 'fixing' | 'passed' | 'merged' | 'stuck'
export type Outcome =
  | 'PASS' | 'FAIL' | 'DONE' | 'DONE_WITH_CONCERNS' | 'NEEDS_CONTEXT' | 'BLOCKED'

/** One milestone of the plan; dependsOn holds slugs. */
export type PlanMilestone = { number: number; slug: string; goal: string; dependsOn: string[] }
/** The run's plan, as read from <changeFolder>/plan.yaml. */
export type PlanGraph = { title: string; changeFolder: string; milestones: PlanMilestone[] }

/** One implementer or verifier subagent. Times are ms since epoch. */
export type AgentRun = {
  agentId: string
  toolUseId: string | null
  number: number
  slug: string
  role: Role
  startedAt: number
  endedAt: number | null
  lastTool: string | null   // one-line summary, e.g. "Bash: ./gradlew test"
  outcome: Outcome | null
}
/** What the mod has seen of one milestone. agents: agentIds in dispatch order. */
export type MilestoneRun = {
  number: number
  slug: string
  agents: string[]
  firstDispatchAt: number
  mergedAt: number | null
}
/** Everything tracked about the session's implement run. */
export type RunState = {
  startedAt: number
  plan: PlanGraph | null
  planError: string | null          // why the plan could not be read, shown in the pane
  milestones: Record<string, MilestoneRun>   // by slug
  agents: Record<string, AgentRun>           // by agentId
}

/** Inputs the tracker reduces; the wiring builds them from engine events. */
export type TrackerEvent =
  | { kind: 'spawn'; agentId: string; toolUseId: string | null; prompt: string; at: number }
  | { kind: 'tool'; agentId: string; summary: string; at: number }
  | { kind: 'resume'; agentId: string; at: number }
  | { kind: 'agentDone'; agentId: string | null; toolUseId: string | null; resultText: string | null; at: number }
  | { kind: 'bash'; command: string; isError: boolean; at: number }
  | { kind: 'plan'; plan: PlanGraph | null; error: string | null }

/** Per-milestone numbers the layout draws. */
export type MilestoneView = {
  status: Status
  implMs: number
  verifyMs: number
  attempts: number        // implementer dispatches
  verifyRounds: number    // verifier dispatches
  wallMs: number | null   // first dispatch → merge; null until merged
  currentTool: string | null
  runningAgentId: string | null
  lastAgentId: string | null
}

/** The run's clock for the pane header and band: `running` while any
 *  agent runs (elapsed counts to now); otherwise `done` when every plan
 *  milestone is merged, else `idle` (elapsed stops at the last agent's end). */
export type RunClock = { phase: 'running' | 'idle' | 'done'; elapsedMs: number }

/** One row of the drawn graph: gutter (lane characters) + body. */
export type Row = {
  key: string
  gutter: string
  body: string
  slug: string | null       // the box this row belongs to, if any
  isHeader: boolean         // the box's header line, drawn as a Button
  status: Status | null
}

declare module 'claude-code' {
  interface PluginState {
    'kentra-rpir': {
      run: RunState | null
      selection: string | null
      isPaneOpen: boolean
    }
  }
}
