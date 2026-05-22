#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  archivePlan,
  buildQueueHealth,
  loadPlans,
  normalizePlanIfNeeded,
  readPlan,
  selectPlan,
  updatePlanStatus
} from "./plans.js";
import { runImplementationProvider, runSimplifyProvider } from "./providers.js";
import { renderQueueHealth, writeRunSummary } from "./summary.js";
import type { PlanFile, ProviderName, RunOptions, RunRecord, RunSummary } from "./types.js";

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await run(options);
}

export async function run(options: RunOptions): Promise<void> {
  const startedAt = new Date().toISOString();
  const repo = path.resolve(options.repo);
  await assertDirectory(repo, "repo");
  options.repo = repo;

  const plansRoot = options.plansDir ? path.resolve(options.plansDir) : undefined;
  if (plansRoot) await assertDirectory(plansRoot, "plans");

  const warnings: string[] = [];
  const failures: string[] = [];
  const records: RunRecord[] = [];
  const summaryPath = options.summary
    ? path.resolve(options.summary)
    : plansRoot
      ? path.join(plansRoot, "ralph-summary.md")
      : path.join(process.cwd(), "ralph-summary.md");

  const dirty = await getDirtyWarning(repo);
  if (dirty) {
    if (options.failOnDirty) {
      throw new Error(dirty);
    }
    warnings.push(dirty);
    console.warn(`Warning: ${dirty}`);
  }

  if (options.planFiles.length > 0) {
    await runExplicitPlans(options, records, warnings, failures, startedAt, summaryPath);
    if (failures.length > 0) throw new Error(`Ralph finished with ${failures.length} failure(s).`);
    return;
  }

  if (!plansRoot) {
    throw new Error("Missing --plans <dir>. Queue mode requires an explicit plan directory.");
  }

  if (options.dryRun) {
    const { active, archived } = await loadPlans(plansRoot);
    const health = buildQueueHealth(active, archived);
    console.log(renderQueueHealth(health));
    await finishSummary(options, startedAt, summaryPath, records, [...warnings, ...health.warnings], [...failures, ...health.failures]);
    if (health.failures.length > 0) throw new Error("Queue health has failures.");
    return;
  }

  let processed = 0;
  while (processed < options.maxItems) {
    const { active, archived } = await loadPlans(plansRoot);
    const health = buildQueueHealth(active, archived);
    warnings.push(...health.warnings);
    if (health.failures.length > 0) {
      failures.push(...health.failures);
      break;
    }

    const selected = selectPlan(health, options.item);
    if (!selected) {
      if (processed === 0) {
        console.log("Ralph found no runnable plans.");
        console.log(renderQueueHealth(health));
      }
      break;
    }

    console.log(`Ralph running plan: ${selected.relativePath}`);
    const record = await runOnePlan(options, selected, plansRoot);
    records.push(record);
    console.log(`Ralph plan result: ${record.status} | ${record.message}`);
    if (record.status === "failed") {
      failures.push(`${record.plan}: ${record.message}`);
      break;
    }
    if (record.simplifyStatus) {
      console.log(`Ralph simplify result: ${record.simplifyStatus} | ${record.simplifyMessage ?? ""}`);
    }
    if (record.archivedPath) {
      console.log(`Ralph archived plan: ${record.archivedPath}`);
    }
    if (record.simplifyStatus === "failed") failures.push(`${record.plan}: simplify failed - ${record.simplifyMessage ?? ""}`);
    processed += 1;
    if (options.once || options.item) break;
  }

  if (processed >= options.maxItems) {
    warnings.push(`Stopped after reaching --max-items ${options.maxItems}.`);
  }

  await finishSummary(options, startedAt, summaryPath, records, unique(warnings), unique(failures));
  console.log(`Ralph summary written: ${summaryPath}`);
  if (failures.length > 0) throw new Error(`Ralph finished with ${failures.length} failure(s).`);
}

async function runExplicitPlans(
  options: RunOptions,
  records: RunRecord[],
  warnings: string[],
  failures: string[],
  startedAt: string,
  summaryPath: string
): Promise<void> {
  const roots = options.planFiles.map((file) => path.dirname(path.resolve(file)));
  for (const file of options.planFiles) {
    const root = path.dirname(path.resolve(file));
    const plan = await readPlan(file, root, false);
    const record = await runOnePlan(options, plan, root);
    records.push(record);
    if (record.status === "failed") failures.push(`${record.plan}: ${record.message}`);
    if (record.simplifyStatus === "failed") failures.push(`${record.plan}: simplify failed - ${record.simplifyMessage ?? ""}`);
    if (options.once) break;
  }
  await finishSummary(options, startedAt, summaryPath, records, unique(warnings), unique(failures));
}

async function runOnePlan(options: RunOptions, plan: PlanFile, plansRoot: string): Promise<RunRecord> {
  const now = new Date().toISOString();
  let current = await normalizePlanIfNeeded(plan, now);
  if (current.metadata.status !== "planned") {
    return { plan: current.path, status: "skipped", message: `Plan status is ${current.metadata.status}.` };
  }

  current = await updatePlanStatus(current, "in-progress", new Date().toISOString());
  const implementation = await runImplementationProvider(options, current, plansRoot);

  if (implementation.exitCode !== 0) {
    return { plan: current.path, status: "failed", message: `Provider exited with code ${implementation.exitCode}.` };
  }
  if (!implementation.result || implementation.result === "failed") {
    return { plan: current.path, status: "failed", message: "Provider omitted required ralph-result line." };
  }

  current = await updatePlanStatus(
    current,
    implementation.result,
    new Date().toISOString(),
    implementation.result === "blocked" ? implementation.message : undefined
  );

  if (implementation.result === "blocked") {
    return { plan: current.path, status: "blocked", message: implementation.message ?? "Blocked." };
  }

  let simplifyStatus: RunRecord["simplifyStatus"] = "skipped";
  let simplifyMessage = options.noSimplify ? "Skipped by --no-simplify." : undefined;
  if (!options.noSimplify) {
    const simplify = await runSimplifyProvider(options, current, plansRoot);
    simplifyStatus = simplify.exitCode === 0 && simplify.result === "done" ? "done" : "failed";
    simplifyMessage = simplify.message ?? (simplify.exitCode === 0 ? "Missing simplify result line." : `Provider exited with code ${simplify.exitCode}.`);
  }

  const archivedPath = await archivePlan(current, plansRoot, new Date().toISOString());
  return {
    plan: current.path,
    status: "done",
    message: implementation.message ?? "Done.",
    archivedPath,
    simplifyStatus,
    simplifyMessage
  };
}

async function finishSummary(
  options: RunOptions,
  startedAt: string,
  summaryPath: string,
  records: RunRecord[],
  warnings: string[],
  failures: string[]
): Promise<void> {
  await mkdir(path.dirname(summaryPath), { recursive: true });
  const summary: RunSummary = {
    repo: options.repo,
    plansDir: options.plansDir ? path.resolve(options.plansDir) : undefined,
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    records,
    warnings,
    failures
  };
  await writeRunSummary(summaryPath, summary);
}

export function parseArgs(args: string[]): RunOptions {
  const options: RunOptions = {
    repo: "",
    planFiles: [],
    provider: (process.env.RALPH_PROVIDER as ProviderName | undefined) ?? "codex",
    agentBin: process.env.RALPH_AGENT_BIN,
    model: undefined,
    modelTier: undefined,
    codexLevel: undefined,
    once: false,
    dryRun: false,
    noSimplify: false,
    failOnDirty: false,
    maxItems: 100,
    retry: {
      retryOnLimit: parseBool(process.env.RALPH_RETRY_ON_LIMIT),
      retryDelayMinutes: Number(process.env.RALPH_RETRY_DELAY_MINUTES ?? "5"),
      retryMaxAttempts: Number(process.env.RALPH_RETRY_MAX_ATTEMPTS ?? "3")
    }
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = (): string => {
      const value = args[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      index += 1;
      return value;
    };

    switch (arg) {
      case "--repo":
        options.repo = next();
        break;
      case "--plans":
        options.plansDir = next();
        break;
      case "--plan":
        options.planFiles.push(next());
        break;
      case "--item":
        options.item = next();
        break;
      case "--provider":
        options.provider = parseProvider(next());
        break;
      case "--agent-bin":
        options.agentBin = next();
        break;
      case "--model":
        options.model = next();
        break;
      case "--model-tier":
        options.modelTier = parseModelTier(next());
        break;
      case "--codex-level":
        options.codexLevel = parseCodexLevel(next());
        break;
      case "--once":
        options.once = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--no-simplify":
        options.noSimplify = true;
        break;
      case "--fail-on-dirty":
        options.failOnDirty = true;
        break;
      case "--summary":
        options.summary = next();
        break;
      case "--max-items":
        options.maxItems = Number(next());
        break;
      case "--retry-on-limit":
        options.retry.retryOnLimit = true;
        break;
      case "--retry-delay-minutes":
        options.retry.retryDelayMinutes = Number(next());
        break;
      case "--retry-max-attempts":
        options.retry.retryMaxAttempts = Number(next());
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.repo) throw new Error("Missing required --repo <path>.");
  if (options.provider !== "codex") throw new Error("Only --provider codex is implemented in this version.");
  if (options.planFiles.length > 0 && options.plansDir) throw new Error("Use either --plans or repeated --plan, not both.");
  if (options.item && !options.plansDir) throw new Error("--item requires --plans <dir>.");
  if (!Number.isFinite(options.maxItems) || options.maxItems < 1) throw new Error("--max-items must be a positive number.");

  return options;
}

function printHelp(): void {
  console.log(`ralph - run implementation plan queues

Usage:
  ralph --repo <repo> --plans <plan-dir> [options]
  ralph --repo <repo> --plan <plan-file> [--plan <plan-file> ...] [options]

Options:
  --provider codex              Agent backend. Default: codex
  --agent-bin <path>            Override provider binary
  --model <name>                Exact provider model
  --model-tier low|medium|high  Resolve model from RALPH_MODEL_<TIER>
  --codex-level low|medium|high|xhigh
                                Codex reasoning effort
  --once                        Process at most one runnable plan
  --item <path-or-basename>     Run one selected plan from --plans
  --dry-run                     Print queue health without mutation
  --no-simplify                 Skip simplify/review pass
  --fail-on-dirty               Fail when repo has uncommitted changes
  --summary <path>              Override summary output path
  --max-items <n>               Safety stop for queue draining. Default: 100
  --retry-on-limit              Retry likely provider limit failures
  --retry-delay-minutes <n>     Delay between retries. Default: 5
  --retry-max-attempts <n>      Max attempts when retry is enabled. Default: 3
`);
}

function parseProvider(value: string): ProviderName {
  if (value === "codex" || value === "gemini") return value;
  throw new Error(`Invalid provider: ${value}`);
}

function parseModelTier(value: string): RunOptions["modelTier"] {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`Invalid model tier: ${value}`);
}

function parseCodexLevel(value: string): RunOptions["codexLevel"] {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") return value;
  throw new Error(`Invalid Codex level: ${value}`);
}

function parseBool(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

async function assertDirectory(dir: string, label: string): Promise<void> {
  const info = await stat(dir).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(`Invalid ${label} directory: ${dir}`);
  }
}

async function getDirtyWarning(repo: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: repo });
    if (stdout.trim()) {
      return `Target repo has uncommitted changes. Ralph will continue and the agent must preserve unrelated changes.`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
