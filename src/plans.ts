import { lstat, mkdir, readFile, realpath, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlanFile, PlanMetadata, PlanStatus, QueueHealth } from "./types.js";

const VALID_STATUSES = new Set<PlanStatus>(["planned", "in-progress", "done", "blocked", "skipped"]);

export function parsePlan(content: string): { metadata: PlanMetadata; body: string; hasMetadata: boolean } {
  const normalized = content.replace(/\r\n/g, "\n");
  const separator = normalized.indexOf("\n\n");
  const head = separator >= 0 ? normalized.slice(0, separator) : normalized;
  const lines = head.split("\n");
  const metadata: PlanMetadata = {};
  let metadataLines = 0;

  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!match) {
      break;
    }
    metadata[match[1]] = match[2];
    metadataLines += 1;
  }

  const hasMetadata = metadataLines > 0 && typeof metadata.status === "string";
  if (!hasMetadata) {
    return { metadata: {}, body: normalized, hasMetadata: false };
  }

  return {
    metadata,
    body: separator >= 0 ? normalized.slice(separator + 2) : "",
    hasMetadata: true
  };
}

export function serializePlan(plan: Pick<PlanFile, "metadata" | "body">): string {
  const preferred = ["status", "created_at", "updated_at", "done_at", "independent", "dependencies", "blocked_reason"];
  const emitted = new Set<string>();
  const lines: string[] = [];

  for (const key of preferred) {
    const value = plan.metadata[key];
    if (value !== undefined) {
      lines.push(`${key}: ${value}`);
      emitted.add(key);
    }
  }

  for (const key of Object.keys(plan.metadata).sort()) {
    if (emitted.has(key)) continue;
    const value = plan.metadata[key];
    if (value !== undefined) {
      lines.push(`${key}: ${value}`);
    }
  }

  return `${lines.join("\n")}\n\n${plan.body.replace(/^\n+/, "")}`;
}

export async function readPlan(filePath: string, rootDir: string, isArchived = false): Promise<PlanFile> {
  const absolute = path.resolve(filePath);
  const [content, linkStat] = await Promise.all([readFile(absolute, "utf8"), lstat(absolute)]);
  const parsed = parsePlan(content);
  const real = await realpath(absolute).catch(() => absolute);
  return {
    path: absolute,
    realPath: real,
    basename: path.basename(absolute),
    relativePath: path.relative(rootDir, absolute),
    metadata: parsed.metadata,
    body: parsed.body,
    hasMetadata: parsed.hasMetadata,
    isArchived,
    isSymlink: linkStat.isSymbolicLink()
  };
}

export async function loadPlans(plansDir: string): Promise<{ active: PlanFile[]; archived: PlanFile[] }> {
  const root = path.resolve(plansDir);
  const activeEntries = await readdir(root, { withFileTypes: true });
  const activeFiles = activeEntries
    .filter((entry) => entry.isFile() || entry.isSymbolicLink())
    .map((entry) => path.join(root, entry.name))
    .filter(isPlanLike);

  const doneDir = path.join(root, "done");
  let archivedFiles: string[] = [];
  if (await exists(doneDir)) {
    const doneEntries = await readdir(doneDir, { withFileTypes: true });
    archivedFiles = doneEntries
      .filter((entry) => entry.isFile() || entry.isSymbolicLink())
      .map((entry) => path.join(doneDir, entry.name))
      .filter(isPlanLike);
  }

  const [active, archived] = await Promise.all([
    Promise.all(activeFiles.sort().map((file) => readPlan(file, root, false))),
    Promise.all(archivedFiles.sort().map((file) => readPlan(file, root, true)))
  ]);

  return { active, archived };
}

export function buildQueueHealth(active: PlanFile[], archived: PlanFile[]): QueueHealth {
  const warnings: string[] = [];
  const failures: string[] = [];
  const allPlans = [...active, ...archived];
  const done = allPlans.filter((plan) => plan.metadata.status === "done");
  const blocked = active.filter((plan) => plan.metadata.status === "blocked");
  const skipped = active.filter((plan) => plan.metadata.status === "skipped");
  const waiting: PlanFile[] = [];
  const runnable: PlanFile[] = [];

  for (const plan of allPlans) {
    const status = plan.metadata.status;
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      failures.push(`${plan.relativePath} has invalid status "${status}".`);
    }
    if (status === "blocked" && !plan.metadata.blocked_reason?.trim()) {
      failures.push(`${plan.relativePath} is blocked but has no blocked_reason.`);
    }
    if (plan.isArchived && status !== "done") {
      failures.push(`${plan.relativePath} is archived but status is not done.`);
    }
  }

  const graph = new Map<string, string[]>();
  for (const plan of active) {
    if (plan.metadata.status !== "planned" && plan.metadata.status !== undefined) continue;
    const deps = parseDependencies(plan.metadata.dependencies);
    graph.set(plan.relativePath, deps);
  }

  const cycle = findCycle(graph);
  if (cycle.length > 0) {
    failures.push(`Dependency cycle detected: ${cycle.join(" -> ")}.`);
  }

  for (const plan of active) {
    const status = plan.metadata.status;
    if (status === "blocked" || status === "skipped" || status === "done" || status === "in-progress") {
      continue;
    }

    const deps = parseDependencies(plan.metadata.dependencies);
    const unsatisfied: string[] = [];
    for (const dep of deps) {
      const match = findPlanByRef(dep, allPlans);
      if (!match) {
        warnings.push(`${plan.relativePath} depends on missing plan "${dep}".`);
        unsatisfied.push(dep);
      } else if (match.metadata.status !== "done") {
        unsatisfied.push(dep);
      }
    }

    if (unsatisfied.length === 0) {
      runnable.push(plan);
    } else {
      waiting.push(plan);
    }
  }

  return {
    active,
    archived,
    runnable: runnable.sort(comparePlans),
    waiting: waiting.sort(comparePlans),
    blocked: blocked.sort(comparePlans),
    skipped: skipped.sort(comparePlans),
    done: done.sort(comparePlans),
    warnings: unique(warnings),
    failures: unique(failures)
  };
}

export function parseDependencies(value: string | undefined): string[] {
  if (!value || value.trim() === "" || value.trim().toLowerCase() === "none") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function selectPlan(health: QueueHealth, item?: string): PlanFile | undefined {
  if (!item) {
    return health.runnable[0];
  }
  const selected = findPlanByRef(item, health.active);
  if (!selected) {
    throw new Error(`Selected plan "${item}" was not found in the active plan queue.`);
  }
  if (!health.runnable.some((plan) => plan.path === selected.path)) {
    throw new Error(`Selected plan "${item}" is not runnable. Current status: ${selected.metadata.status ?? "missing metadata"}.`);
  }
  return selected;
}

export async function normalizePlanIfNeeded(plan: PlanFile, now: string): Promise<PlanFile> {
  if (plan.hasMetadata) {
    return plan;
  }
  const metadata: PlanMetadata = {
    status: "planned",
    created_at: now,
    updated_at: now,
    done_at: "none",
    independent: "yes",
    dependencies: "none"
  };
  const next = { ...plan, metadata, hasMetadata: true };
  await writeFile(plan.realPath, serializePlan(next), "utf8");
  return next;
}

export async function updatePlanStatus(plan: PlanFile, status: PlanStatus, now: string, reason?: string): Promise<PlanFile> {
  const metadata: PlanMetadata = { ...plan.metadata };
  metadata.status = status;
  metadata.updated_at = now;
  if (!metadata.created_at) metadata.created_at = now;
  if (!metadata.independent) metadata.independent = "yes";
  if (!metadata.dependencies) metadata.dependencies = "none";
  if (status === "done") {
    metadata.done_at = now;
    delete metadata.blocked_reason;
  } else if (status === "blocked") {
    metadata.done_at = "none";
    metadata.blocked_reason = reason?.trim() || "Blocked without a specific reason.";
  } else {
    metadata.done_at = "none";
    delete metadata.blocked_reason;
  }
  const next = { ...plan, metadata, hasMetadata: true };
  await writeFile(plan.realPath, serializePlan(next), "utf8");
  return next;
}

export async function archivePlan(plan: PlanFile, plansDir: string, now: string): Promise<string> {
  const root = path.resolve(plansDir);
  if (plan.isSymlink && path.dirname(plan.path) !== root) {
    throw new Error(`Cannot archive symlinked plan outside the plan directory: ${plan.path}`);
  }
  await mkdir(path.join(root, "done"), { recursive: true });
  const destination = await nextArchivePath(path.join(root, "done", plan.basename), now);
  await rename(plan.path, destination);
  return destination;
}

export function findPlanByRef(ref: string, plans: PlanFile[]): PlanFile | undefined {
  const normalized = path.normalize(ref);
  const absolute = path.isAbsolute(ref) ? path.resolve(ref) : undefined;
  return plans.find((plan) => {
    return (
      plan.basename === ref ||
      path.normalize(plan.relativePath) === normalized ||
      plan.path === absolute ||
      plan.realPath === absolute
    );
  });
}

export function isPlanLike(filePath: string): boolean {
  const base = path.basename(filePath);
  return base.endsWith(".plan.md") || base.endsWith("-plan.md");
}

async function nextArchivePath(destination: string, now: string): Promise<string> {
  if (!(await exists(destination))) {
    return destination;
  }
  const parsed = path.parse(destination);
  const suffix = now.replace(/[:.]/g, "-");
  const name = parsed.base.endsWith(".plan.md")
    ? `${parsed.base.slice(0, -".plan.md".length)}-${suffix}.plan.md`
    : `${parsed.name}-${suffix}${parsed.ext}`;
  return path.join(parsed.dir, name);
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(() => true, () => false);
}

function comparePlans(a: PlanFile, b: PlanFile): number {
  return a.relativePath.localeCompare(b.relativePath);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function findCycle(graph: Map<string, string[]>): string[] {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (node: string): string[] => {
    if (visiting.has(node)) {
      return stack.slice(stack.indexOf(node)).concat(node);
    }
    if (visited.has(node)) return [];
    visiting.add(node);
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      const depNode = [...graph.keys()].find((key) => key === dep || path.basename(key) === dep);
      if (!depNode) continue;
      const cycle = visit(depNode);
      if (cycle.length > 0) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return [];
  };

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle.length > 0) return cycle;
  }
  return [];
}
