import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs, run } from "../src/cli.js";

describe("CLI args", () => {
  it("parses Codex medium and high controls", () => {
    const medium = parseArgs(["--repo", "/tmp", "--plans", "/tmp/plans", "--codex-level", "medium"]);
    expect(medium.codexLevel).toBe("medium");

    const high = parseArgs(["--repo", "/tmp", "--plans", "/tmp/plans", "--model-tier", "high", "--codex-level", "high"]);
    expect(high.modelTier).toBe("high");
    expect(high.codexLevel).toBe("high");
  });
});

describe("integration with fake provider", () => {
  it("drains the queue by default and archives completed plans", async () => {
    const root = await tempDir();
    const repo = path.join(root, "repo");
    const plans = path.join(root, "plans");
    await mkdir(repo);
    await mkdir(plans);
    await writeFile(path.join(plans, "a.plan.md"), plan("planned"), "utf8");
    await writeFile(path.join(plans, "b.plan.md"), plan("planned"), "utf8");
    const provider = await fakeProvider(root, [
      "ralph-result: done | implemented",
      "ralph-simplify-result: done | simplified"
    ]);

    await run(parseArgs([
      "--repo", repo,
      "--plans", plans,
      "--agent-bin", provider,
      "--max-items", "5"
    ]));

    const summary = await readFile(path.join(plans, "ralph-summary.md"), "utf8");
    expect(summary).toContain("done:");
    expect(await readFile(path.join(plans, "done", "a.plan.md"), "utf8")).toContain("status: done");
    expect(await readFile(path.join(plans, "done", "b.plan.md"), "utf8")).toContain("status: done");
  });

  it("runs Codex providers in YOLO mode", async () => {
    const root = await tempDir();
    const repo = path.join(root, "repo");
    const plans = path.join(root, "plans");
    const argsFile = path.join(root, "args.json");
    await mkdir(repo);
    await mkdir(plans);
    await writeFile(path.join(plans, "a.plan.md"), plan("planned"), "utf8");
    const provider = await fakeProvider(root, [
      "ralph-result: done | implemented",
      "ralph-simplify-result: done | simplified"
    ], argsFile);

    await run(parseArgs([
      "--repo", repo,
      "--plans", plans,
      "--agent-bin", provider,
      "--once"
    ]));

    const calls = JSON.parse(await readFile(argsFile, "utf8")) as string[][];
    expect(calls[0]).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(calls[0]).not.toContain("--ask-for-approval");
    expect(calls[0]).not.toContain("--sandbox");
  });

  it("leaves plan in progress when result line is missing", async () => {
    const root = await tempDir();
    const repo = path.join(root, "repo");
    const plans = path.join(root, "plans");
    await mkdir(repo);
    await mkdir(plans);
    await writeFile(path.join(plans, "a.plan.md"), plan("planned"), "utf8");
    const provider = await fakeProvider(root, ["no result"]);

    await expect(run(parseArgs([
      "--repo", repo,
      "--plans", plans,
      "--agent-bin", provider,
      "--once",
      "--no-simplify"
    ]))).rejects.toThrow(/failure/);

    const content = await readFile(path.join(plans, "a.plan.md"), "utf8");
    expect(content).toContain("status: in-progress");
  });
});

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ralph-cli-test-"));
}

async function fakeProvider(root: string, lines: string[], argsFile?: string): Promise<string> {
  const file = path.join(root, "fake-provider.cjs");
  const script = `#!/usr/bin/env node
const fs = require("fs");
const argsFile = ${JSON.stringify(argsFile)};
if (argsFile) {
  const calls = fs.existsSync(argsFile) ? JSON.parse(fs.readFileSync(argsFile, "utf8")) : [];
  calls.push(process.argv.slice(2));
  fs.writeFileSync(argsFile, JSON.stringify(calls));
}
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const isSimplify = input.includes("ralph-simplify-result");
  console.log(isSimplify ? ${JSON.stringify(lines[1] ?? lines[0])} : ${JSON.stringify(lines[0])});
});
`;
  await writeFile(file, script, "utf8");
  await chmod(file, 0o755);
  return file;
}

function plan(status: string): string {
  return [
    `status: ${status}`,
    "created_at: 2026-05-21T12:00:00.000Z",
    "updated_at: 2026-05-21T12:00:00.000Z",
    "done_at: none",
    "independent: yes",
    "dependencies: none",
    "",
    "# Plan",
    ""
  ].join("\n");
}
