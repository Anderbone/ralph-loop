status: done
created_at: 2026-05-21T12:19:33.000Z
updated_at: 2026-05-21T12:59:30.000Z
done_at: 2026-05-21T12:59:30.000Z
independent: yes
dependencies: none

# Global Ralph CLI Plan

## Resolved Decisions

- Distribution: build one global Linux CLI package, not repo-local `scripts/ralph/*` copies.
- Executable name: use `ralph` only. Do not ship alternate public command names initially.
- Scope: run existing plan files only. Do not support the old `doc/harness` planner/backlog/current-task flow.
- Plan location: support external plan directories with `--plans <dir>`, including directories outside the target repository.
- Symlinks: support symlinked plan directories and symlinked plan files when resolving plans and dependencies.
- Plan selection: make directory mode the primary path, and also support `--once`, `--item`, and repeated `--plan` for smaller or explicit runs.
- Plan outputs: archive completed plans under `<plans>/done/` and write the current summary to `<plans>/ralph-summary.md`.
- Simplify pass: run a simplify/review pass by default, with `--no-simplify` for fast or low-risk runs.
- Dirty target worktree: warn and continue by default. Provide `--fail-on-dirty` for stricter automation.
- Default run mode: process the whole runnable queue by default until no runnable plans remain or `--max-items` is reached. Provide `--once` for one-plan manual runs.
- Final state ownership: Ralph owns final plan metadata transitions based on the implementation agent's final `ralph-result:` line. The agent may edit plan notes, but Ralph updates status fields consistently and validates blocked reasons.
- Missing provider result: if the provider exits successfully but omits the required final result line, leave the plan `in-progress`, write a summary failure, and exit non-zero.
- Plan directory argument: require `--plans` for queue mode in the first version. Do not silently default to `<repo>/doc/plan`.
- Explicit plan selection: support `--plans <dir> --item <name>` for selecting from a queue, and support repeated `--plan <file>` for explicit batches. Keep `--item` scoped to a plan directory.
- Plan directory depth: load active plans only from direct children of `--plans`; do not recursively scan arbitrary subfolders. Use `<plans>/done/` as the only managed archive subfolder.
- Archive collisions: if the destination exists in `<plans>/done/`, append a timestamp suffix before `.plan.md`.
- Symlink archiving: resolve symlinked plan directories normally. For individual symlinked plan files, mutate the target during execution but archive by moving the symlink entry only if it lives inside the plan directory; otherwise fail with a clear warning before mutation.
- Package name: use `ralph-loop-cli`, with `"bin": { "ralph": "./dist/cli.js" }`.
- Provider retries: expose retry behavior through CLI flags and environment variables.
- Simplify failure behavior: a failed simplify pass does not block archiving of a completed implementation plan, but it is recorded prominently in the summary and the command exits non-zero.

## Remaining Questions

None. The agreed decisions above are ready for implementation.

## Goal

Create a global Linux command-line Ralph loop that runs existing implementation plan files against a target repository.

The core command should be simple:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --provider codex
```

The global CLI should replace the need to maintain repo-local `scripts/ralph/*` copies for the doc-plan workflow.

## Current State

- Cable Flow currently has a repo-local TypeScript Ralph loop under `scripts/ralph/`.
- That script supports two modes:
  - old harness mode based on `doc/harness/master-plan.md`, `doc/harness/loop/backlog.md`, and `current-task.md`
  - newer doc-plan mode based on active `doc/plan/*.plan.md` files
- The doc-plan mode is the useful generalizable piece:
  - scan plan files
  - select the first runnable plan
  - mark it `in-progress`
  - run an implementation agent
  - require the agent to finish with a clear `done` or `blocked` result
  - optionally run a simplify agent
  - archive completed plans under `done/`
  - write a run summary
- The desired next use case is:
  - target repo: `~/github/demo-projects/opsdesk-ai`
  - plan directory: `/home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan`

## Scope

- Build a standalone global CLI named `ralph`.
- Support Linux first.
- Support external target repos with `--repo <path>`.
- Require external plan directories with `--plans <path>` for queue mode.
- Support explicit queue item selection with `--item <path-or-basename>`.
- Support explicit plan file batches with repeated `--plan <path>`.
- Process the whole runnable queue by default, with `--once` for one-plan runs.
- Support `codex` first and keep provider design open for `gemini`.
- Preserve the existing doc-plan metadata contract.
- Keep agent prompts generic and repo-aware:
  - agents must read the target repo's `AGENTS.md` first when present
  - agents must inspect the repo before changing files
  - agents must preserve unrelated user changes
  - agents must run verification required by the target repo instructions
  - agents must report only the selected plan result unless the plan explicitly says otherwise

## Non-Goals

- Do not implement the old `doc/harness` planner/backlog/current-task flow.
- Do not generate plans from a master plan.
- Do not require a `doc/plan` symlink in the target repo.
- Do not hard-code Cable Flow-specific conventions into the global CLI.
- Do not create a UI.
- Do not make Ralph a skill-only workflow; it must be runnable directly from the shell.

## Plan File Contract

Each active plan should start with:

```md
status: planned
created_at: 2026-05-21T12:00:00.000Z
updated_at: 2026-05-21T12:00:00.000Z
done_at: none
independent: yes
dependencies: none

# Feature Plan
```

Supported statuses:

- `planned`: runnable when dependencies are done
- `in-progress`: selected by Ralph; skipped by later runs until a human resets it
- `done`: complete; archived under `done/`
- `blocked`: not runnable; must include `blocked_reason: <specific reason>`
- `skipped`: intentionally excluded

Dependency rules:

- `dependencies: none` means independent.
- Dependencies may be plan basenames or paths relative to the plan directory.
- Only `status: done` satisfies a dependency.
- Missing dependencies produce warnings but should not block unrelated runnable plans.
- Cycles are fatal and stop the run before mutation.

## CLI Design

Primary commands:

```bash
ralph --repo <repo> --plans <plan-dir> [options]
ralph --repo <repo> --plan <plan-file> [--plan <plan-file> ...] [options]
```

Options:

- `--provider codex|gemini`: agent backend, default `codex`
- `--agent-bin <path>`: override provider binary
- `--model <name>`: exact provider model
- `--model-tier low|medium|high`: abstract tier alias
- `--codex-level low|medium|high|xhigh`: Codex reasoning effort when supported
- `--once`: process at most one runnable plan
- `--plan <path>`: run one explicit plan file; can be repeated for explicit batches
- `--item <path-or-basename>`: run one selected plan from `--plans`
- `--dry-run`: print queue health and selected plan without writing files or running agents
- `--no-simplify`: skip the simplify pass
- `--fail-on-dirty`: fail when the target repo has uncommitted changes
- `--summary <path>`: override summary output path
- `--max-items <n>`: safety stop, default high enough for normal queues
- `--retry-on-limit`: retry likely provider limit failures
- `--retry-delay-minutes <n>`: minutes to wait between provider limit retries
- `--retry-max-attempts <n>`: maximum provider launch attempts when retry is enabled

Environment variables:

- `RALPH_PROVIDER`
- `RALPH_AGENT_BIN`
- `RALPH_CODEX_BIN`
- `RALPH_GEMINI_BIN`
- `RALPH_MODEL`
- `RALPH_CODEX_MODEL`
- `RALPH_GEMINI_MODEL`
- `RALPH_MODEL_LOW`
- `RALPH_MODEL_MEDIUM`
- `RALPH_MODEL_HIGH`
- `RALPH_RETRY_ON_LIMIT`
- `RALPH_RETRY_DELAY_MINUTES`
- `RALPH_RETRY_MAX_ATTEMPTS`

## Implementation Tasks

1. Scaffold the CLI package.
   - Use package name `ralph-loop-cli`.
   - Create a Node/TypeScript project with a `bin` entry for `ralph`.
   - Prefer TypeScript source and compiled JavaScript output for global installation.
   - Add a README with install and usage examples.

2. Port the reusable doc-plan parser and queue logic.
   - Parse metadata blocks.
   - Normalize old plan files that lack metadata only when selected for execution.
   - Load active plans from direct children of `--plans`.
   - Do not recursively scan plan subfolders.
   - Load archived plans from `<plans>/done/` only for dependency resolution.
   - Summarize runnable, waiting, blocked, skipped, done, warnings, and failures.

3. Add plan selection.
   - Select the alphabetically first runnable plan on each queue iteration.
   - Support `--plans <dir> --item <name>` by basename, relative path, or absolute path within the queue.
   - Support repeated `--plan <file>` for explicit batches outside directory queue mode.
   - Fail clearly when the selected plan is missing or not runnable.

4. Add state mutation.
   - Mark selected plans `in-progress` before launching the implementation agent.
   - Mark plans `done` or `blocked` based on the implementation agent's final `ralph-result:` line.
   - If the provider exits successfully but omits the required final result line, leave the plan `in-progress`, write a summary failure, and exit non-zero.
   - Normalize `updated_at` on every state change.
   - Set `done_at` only for `done`.
   - Require `blocked_reason` for `blocked`.

5. Add provider execution.
   - Start with `codex` support.
   - Preserve a provider registry so `gemini` can be added without changing queue logic.
   - Run agents from the target repo working directory.
   - Pass a prompt that names the selected plan path and target repo.
   - Capture stdout/stderr for machine-readable result lines.

6. Add implementation and simplify prompts.
   - Implementation prompt final line:
     `ralph-result: done | <one sentence>`
     or
     `ralph-result: blocked | <one sentence>`
   - Simplify prompt final line:
     `ralph-simplify-result: done | <one sentence>`
     or
     `ralph-simplify-result: failed | <one sentence>`
   - Feedback lines should be reserved for human-actionable blockers, open questions, AGENTS wording improvements, Ralph improvements, or follow-up outside selected plan scope.

7. Add archiving and summary output.
   - Move completed plans to `<plans>/done/<basename>.plan.md`.
   - If the archive destination exists, append a timestamp suffix before `.plan.md`.
   - Resolve symlinked plan directories normally.
   - For individual symlinked plan files, mutate the target during execution but archive by moving the symlink entry only if it lives inside the plan directory; otherwise fail with a clear warning before mutation.
   - Do not archive blocked, skipped, or in-progress plans.
   - Write `<plans>/ralph-summary.md` by default.
   - Include completed plans, blocked plans, archived paths, queue warnings, queue failures, and actionable feedback.
   - If simplify fails after a completed implementation, archive the plan, record simplify failure prominently, and exit non-zero.

8. Add retry controls for provider limits.
   - Detect likely provider limit failures from process output.
   - Allow retry behavior through environment variables and `--retry-on-limit`, `--retry-delay-minutes <n>`, and `--retry-max-attempts <n>`.
   - Keep retry off by default unless explicitly configured.

9. Add tests.
   - Unit-test metadata parsing.
   - Unit-test dependency resolution.
   - Unit-test queue health failures.
   - Unit-test selection by basename, relative path, and absolute path.
   - Unit-test archive behavior.
   - Unit-test summary generation.
   - Add a small integration test with a fake provider binary.

10. Add installation workflow.
    - Support local development with `pnpm install` and `pnpm build`.
    - Support global installation with `pnpm link --global` or `npm install -g` from a packed package.
    - Document the exact command to run against `opsdesk-ai`.

## Guardrails

- Never mutate the target repo except through the launched agent.
- Ralph itself may mutate only selected plan metadata, archive completed plans, and write summary files.
- Do not require the plan directory to be inside the target repo.
- Do not hide unfinished work in `done/`.
- Fail before mutation on dependency cycles or invalid archived plan state.
- Warn before mutation for dirty target worktrees unless `--fail-on-dirty` is set.
- Keep prompt contracts short and stable.
- Keep Cable Flow-specific instructions out of this global CLI.

## Verification

Use the new CLI repository's own checks once scaffolded:

```bash
pnpm run typecheck
pnpm run test:ci
pnpm run build
```

Manual smoke test:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --provider codex \
  --dry-run
```

Then run the full runnable queue:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --provider codex
```

Run only one plan when needed:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --provider codex \
  --once
```

## Ralph Skill Role

A Ralph skill can exist, but it should not contain the loop implementation.

The skill should only help an agent operate the CLI:

- check whether `ralph` is installed
- initialize or normalize plan metadata
- choose the correct `--repo` and `--plans` arguments
- run `ralph --dry-run`
- explain queue health failures
- recommend fixes for blocked plans

This keeps the durable automation in one command-line tool while still making Ralph easy for agents to use across repositories.
