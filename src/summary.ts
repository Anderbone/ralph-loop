import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { QueueHealth, RunSummary } from "./types.js";

export function renderQueueHealth(health: QueueHealth): string {
  const lines = [
    "# Ralph Queue Health",
    "",
    `Runnable: ${health.runnable.length}`,
    `Waiting: ${health.waiting.length}`,
    `Blocked: ${health.blocked.length}`,
    `Skipped: ${health.skipped.length}`,
    `Done: ${health.done.length}`,
    `Warnings: ${health.warnings.length}`,
    `Failures: ${health.failures.length}`
  ];

  if (health.runnable.length > 0) {
    lines.push("", "## Runnable", ...health.runnable.map((plan) => `- ${plan.relativePath}`));
  }
  if (health.waiting.length > 0) {
    lines.push("", "## Waiting", ...health.waiting.map((plan) => `- ${plan.relativePath}`));
  }
  if (health.warnings.length > 0) {
    lines.push("", "## Warnings", ...health.warnings.map((warning) => `- ${warning}`));
  }
  if (health.failures.length > 0) {
    lines.push("", "## Failures", ...health.failures.map((failure) => `- ${failure}`));
  }
  return `${lines.join("\n")}\n`;
}

export function renderRunSummary(summary: RunSummary): string {
  const lines = [
    "# Ralph Summary",
    "",
    `Repo: ${summary.repo}`,
    summary.plansDir ? `Plans: ${summary.plansDir}` : undefined,
    `Started: ${summary.startedAt}`,
    `Finished: ${summary.finishedAt}`,
    `Dry run: ${summary.dryRun ? "yes" : "no"}`,
    "",
    "## Records"
  ].filter((line): line is string => line !== undefined);

  if (summary.records.length === 0) {
    lines.push("- None");
  } else {
    for (const record of summary.records) {
      lines.push(`- ${record.status}: ${record.plan} - ${record.message}`);
      if (record.archivedPath) lines.push(`  Archived: ${record.archivedPath}`);
      if (record.simplifyStatus) lines.push(`  Simplify: ${record.simplifyStatus} - ${record.simplifyMessage ?? ""}`);
    }
  }

  lines.push("", "## Warnings");
  lines.push(...(summary.warnings.length > 0 ? summary.warnings.map((warning) => `- ${warning}`) : ["- None"]));

  lines.push("", "## Failures");
  lines.push(...(summary.failures.length > 0 ? summary.failures.map((failure) => `- ${failure}`) : ["- None"]));

  return `${lines.join("\n")}\n`;
}

export async function writeRunSummary(summaryPath: string, summary: RunSummary): Promise<void> {
  await writeFile(path.resolve(summaryPath), renderRunSummary(summary), "utf8");
}
