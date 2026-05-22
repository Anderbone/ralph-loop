export type PlanStatus = "planned" | "in-progress" | "done" | "blocked" | "skipped";

export type ProviderName = "codex" | "gemini";

export interface PlanMetadata {
  status?: PlanStatus;
  created_at?: string;
  updated_at?: string;
  done_at?: string;
  independent?: string;
  dependencies?: string;
  blocked_reason?: string;
  [key: string]: string | undefined;
}

export interface PlanFile {
  path: string;
  realPath: string;
  basename: string;
  relativePath: string;
  metadata: PlanMetadata;
  body: string;
  hasMetadata: boolean;
  isArchived: boolean;
  isSymlink: boolean;
}

export interface QueueHealth {
  active: PlanFile[];
  archived: PlanFile[];
  runnable: PlanFile[];
  waiting: PlanFile[];
  blocked: PlanFile[];
  skipped: PlanFile[];
  done: PlanFile[];
  warnings: string[];
  failures: string[];
}

export interface ProviderResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  result?: "done" | "blocked" | "failed";
  message?: string;
  limitLikely: boolean;
}

export interface RetryConfig {
  retryOnLimit: boolean;
  retryDelayMinutes: number;
  retryMaxAttempts: number;
}

export interface RunOptions {
  repo: string;
  plansDir?: string;
  planFiles: string[];
  item?: string;
  provider: ProviderName;
  agentBin?: string;
  model?: string;
  modelTier?: "low" | "medium" | "high";
  codexLevel?: "low" | "medium" | "high" | "xhigh";
  once: boolean;
  dryRun: boolean;
  noSimplify: boolean;
  failOnDirty: boolean;
  summary?: string;
  maxItems: number;
  retry: RetryConfig;
}

export interface RunRecord {
  plan: string;
  status: "done" | "blocked" | "failed" | "skipped";
  message: string;
  archivedPath?: string;
  simplifyStatus?: "done" | "failed" | "skipped";
  simplifyMessage?: string;
}

export interface RunSummary {
  repo: string;
  plansDir?: string;
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  records: RunRecord[];
  warnings: string[];
  failures: string[];
}
