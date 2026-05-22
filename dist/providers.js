import { spawn } from "node:child_process";
import path from "node:path";
const RESULT_RE = /ralph-result:\s*(done|blocked)\s*\|\s*(.+)/gi;
const SIMPLIFY_RESULT_RE = /ralph-simplify-result:\s*(done|failed)\s*\|\s*(.+)/gi;
export async function runImplementationProvider(options, plan, plansRoot) {
    const prompt = [
        "You are running under Ralph, a plan queue CLI.",
        "",
        `Target repository: ${options.repo}`,
        `Selected plan file: ${plan.path}`,
        plansRoot ? `Plan queue directory: ${plansRoot}` : undefined,
        "",
        "Instructions:",
        "- Read the target repo's AGENTS.md first when present.",
        "- Inspect the repo before changing files.",
        "- Preserve unrelated user changes.",
        "- Implement only the selected plan unless the plan explicitly says otherwise.",
        "- Run the verification required by the repo instructions and the plan.",
        "- You may edit plan notes if useful, but Ralph owns final status metadata.",
        "",
        "Your final response must end with exactly one result line:",
        "ralph-result: done | <one sentence summary>",
        "or",
        "ralph-result: blocked | <one sentence blocker reason>"
    ].filter(Boolean).join("\n");
    return runProviderWithRetry(options, prompt, "implementation", plansRoot);
}
export async function runSimplifyProvider(options, plan, plansRoot) {
    const prompt = [
        "You are running a Ralph simplify/review pass after an implementation plan completed.",
        "",
        `Target repository: ${options.repo}`,
        `Completed plan file: ${plan.path}`,
        plansRoot ? `Plan queue directory: ${plansRoot}` : undefined,
        "",
        "Instructions:",
        "- Read the target repo's AGENTS.md first when present.",
        "- Review the recent implementation for unnecessary complexity, duplication, missed reuse, and readability problems.",
        "- Simplify only when behavior, public types, and return contracts stay unchanged.",
        "- Preserve unrelated user changes.",
        "- Run relevant verification when you change files.",
        "",
        "Your final response must end with exactly one result line:",
        "ralph-simplify-result: done | <one sentence summary>",
        "or",
        "ralph-simplify-result: failed | <one sentence reason>"
    ].filter(Boolean).join("\n");
    return runProviderWithRetry(options, prompt, "simplify", plansRoot);
}
export function parseProviderResult(output, kind) {
    const regex = kind === "implementation" ? RESULT_RE : SIMPLIFY_RESULT_RE;
    regex.lastIndex = 0;
    let match;
    let last;
    while ((match = regex.exec(output)) !== null) {
        last = match;
    }
    if (!last)
        return {};
    return { result: last[1], message: last[2].trim() };
}
async function runProviderWithRetry(options, prompt, kind, plansRoot) {
    let attempt = 0;
    let last;
    const retry = options.retry;
    const maxAttempts = retry.retryOnLimit ? Math.max(1, retry.retryMaxAttempts) : 1;
    while (attempt < maxAttempts) {
        attempt += 1;
        last = await runProvider(options, prompt, kind, plansRoot);
        if (!last.limitLikely || !retry.retryOnLimit || attempt >= maxAttempts) {
            return last;
        }
        await sleep(Math.max(0, retry.retryDelayMinutes) * 60_000);
    }
    return last;
}
async function runProvider(options, prompt, kind, plansRoot) {
    if (options.provider !== "codex") {
        throw new Error(`Provider "${options.provider}" is not implemented yet.`);
    }
    const bin = options.agentBin ?? process.env.RALPH_CODEX_BIN ?? process.env.RALPH_AGENT_BIN ?? "codex";
    const args = ["exec", "-C", options.repo, "--dangerously-bypass-approvals-and-sandbox", "--color", "never"];
    if (plansRoot) {
        args.push("--add-dir", plansRoot);
    }
    const model = resolveModel(options);
    if (model) {
        args.push("--model", model);
    }
    if (options.codexLevel) {
        args.push("-c", `model_reasoning_effort="${options.codexLevel}"`);
    }
    args.push("-");
    const result = await spawnWithInput(bin, args, prompt, options.repo);
    const parsed = parseProviderResult(`${result.stdout}\n${result.stderr}`, kind);
    return {
        ...result,
        ...parsed,
        limitLikely: isLikelyLimitFailure(`${result.stdout}\n${result.stderr}`)
    };
}
function resolveModel(options) {
    if (options.model)
        return options.model;
    if (options.provider === "codex" && process.env.RALPH_CODEX_MODEL)
        return process.env.RALPH_CODEX_MODEL;
    if (options.modelTier) {
        const envName = `RALPH_MODEL_${options.modelTier.toUpperCase()}`;
        return process.env[envName];
    }
    return process.env.RALPH_MODEL;
}
async function spawnWithInput(bin, args, input, cwd) {
    return new Promise((resolve) => {
        const child = spawn(bin, args, { cwd: path.resolve(cwd), stdio: ["pipe", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
            process.stdout.write(chunk);
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk;
            process.stderr.write(chunk);
        });
        child.on("error", (error) => {
            stderr += `${error.message}\n`;
        });
        child.on("close", (code) => {
            resolve({ exitCode: code ?? 1, stdout, stderr });
        });
        child.stdin.end(input);
    });
}
function isLikelyLimitFailure(output) {
    return /rate limit|usage limit|quota|too many requests|429/i.test(output);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
