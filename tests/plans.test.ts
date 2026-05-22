import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  archivePlan,
  buildQueueHealth,
  loadPlans,
  normalizePlanIfNeeded,
  parseDependencies,
  parsePlan,
  readPlan,
  selectPlan,
  updatePlanStatus
} from "../src/plans.js";

describe("plan parsing", () => {
  it("parses metadata and body", () => {
    const parsed = parsePlan("status: planned\ncreated_at: now\n\ndo work\n");
    expect(parsed.hasMetadata).toBe(true);
    expect(parsed.metadata.status).toBe("planned");
    expect(parsed.body).toBe("do work\n");
  });

  it("detects plans without metadata", () => {
    const parsed = parsePlan("# Title\n\nDo work\n");
    expect(parsed.hasMetadata).toBe(false);
    expect(parsed.body).toContain("# Title");
  });
});

describe("dependencies and queue health", () => {
  it("resolves done dependencies by basename", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "a.plan.md"), plan("done"), "utf8");
    await writeFile(path.join(root, "b.plan.md"), plan("planned", "a.plan.md"), "utf8");
    const { active, archived } = await loadPlans(root);
    const health = buildQueueHealth(active, archived);
    expect(health.runnable.map((item) => item.basename)).toEqual(["b.plan.md"]);
    expect(health.failures).toEqual([]);
  });

  it("warns on missing dependencies and does not block unrelated plans", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "a.plan.md"), plan("planned", "missing.plan.md"), "utf8");
    await writeFile(path.join(root, "b.plan.md"), plan("planned"), "utf8");
    const { active, archived } = await loadPlans(root);
    const health = buildQueueHealth(active, archived);
    expect(health.warnings[0]).toContain("missing.plan.md");
    expect(health.runnable.map((item) => item.basename)).toEqual(["b.plan.md"]);
  });

  it("fails dependency cycles", async () => {
    const root = await tempDir();
    await writeFile(path.join(root, "a.plan.md"), plan("planned", "b.plan.md"), "utf8");
    await writeFile(path.join(root, "b.plan.md"), plan("planned", "a.plan.md"), "utf8");
    const { active, archived } = await loadPlans(root);
    const health = buildQueueHealth(active, archived);
    expect(health.failures[0]).toContain("Dependency cycle");
  });

  it("parses comma separated dependencies", () => {
    expect(parseDependencies("a.plan.md, b.plan.md")).toEqual(["a.plan.md", "b.plan.md"]);
    expect(parseDependencies("none")).toEqual([]);
  });
});

describe("selection and mutation", () => {
  it("selects by basename and normalizes missing metadata only when requested", async () => {
    const root = await tempDir();
    const file = path.join(root, "legacy.plan.md");
    await writeFile(file, "# Legacy\n", "utf8");
    const { active, archived } = await loadPlans(root);
    const health = buildQueueHealth(active, archived);
    const selected = selectPlan(health, "legacy.plan.md");
    expect(selected?.hasMetadata).toBe(false);
    const normalized = await normalizePlanIfNeeded(selected!, "2026-05-21T12:00:00.000Z");
    expect(normalized.metadata.status).toBe("planned");
    expect(await readFile(file, "utf8")).toContain("status: planned");
  });

  it("updates blocked status with a blocked reason", async () => {
    const root = await tempDir();
    const file = path.join(root, "a.plan.md");
    await writeFile(file, plan("planned"), "utf8");
    const planFile = await readPlan(file, root);
    await updatePlanStatus(planFile, "blocked", "2026-05-21T12:00:00.000Z", "Needs API key.");
    const updated = await readFile(file, "utf8");
    expect(updated).toContain("status: blocked");
    expect(updated).toContain("blocked_reason: Needs API key.");
  });
});

describe("archive behavior", () => {
  it("archives completed plans and avoids collisions", async () => {
    const root = await tempDir();
    const file = path.join(root, "a.plan.md");
    const done = path.join(root, "done");
    await writeFile(file, plan("done"), "utf8");
    await writeFile(path.join(done, "placeholder").replace("placeholder", "../placeholder"), "", "utf8").catch(() => undefined);
    await import("node:fs/promises").then((fs) => fs.mkdir(done, { recursive: true }));
    await writeFile(path.join(done, "a.plan.md"), plan("done"), "utf8");
    const planFile = await readPlan(file, root);
    const archived = await archivePlan(planFile, root, "2026-05-21T12:00:00.000Z");
    expect(path.basename(archived)).toBe("a-2026-05-21T12-00-00-000Z.plan.md");
  });

  it("loads only one active folder level", async () => {
    const root = await tempDir();
    await import("node:fs/promises").then((fs) => fs.mkdir(path.join(root, "nested"), { recursive: true }));
    await writeFile(path.join(root, "a-plan.md"), plan("planned"), "utf8");
    await writeFile(path.join(root, "nested", "b.plan.md"), plan("planned"), "utf8");
    await writeFile(path.join(root, "README.md"), plan("planned"), "utf8");
    const { active } = await loadPlans(root);
    expect(active.map((item) => item.basename)).toEqual(["a-plan.md"]);
  });

  it("supports symlinked plan directories", async () => {
    const real = await tempDir();
    const linked = `${real}-link`;
    await writeFile(path.join(real, "a.plan.md"), plan("planned"), "utf8");
    await symlink(real, linked, "dir");
    const { active } = await loadPlans(linked);
    expect(active.map((item) => item.basename)).toEqual(["a.plan.md"]);
  });
});

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ralph-test-"));
}

function plan(status: string, dependencies = "none"): string {
  return [
    `status: ${status}`,
    "created_at: 2026-05-21T12:00:00.000Z",
    "updated_at: 2026-05-21T12:00:00.000Z",
    status === "done" ? "done_at: 2026-05-21T12:00:00.000Z" : "done_at: none",
    "independent: yes",
    `dependencies: ${dependencies}`,
    "",
    "# Plan",
    ""
  ].join("\n");
}
