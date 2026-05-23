# Ralph

Ralph is a command-line runner for doc-plan queues. Point it at a target repository and a folder of `*.plan.md` files, and Ralph will run an implementation agent through the runnable plans one by one.

It is intentionally narrow:

- It runs doc-plan files only.
- It does not generate plans for you.
- It does not use project-specific harnesses, backlog files, or private conventions.
- Ralph only edits plan metadata, archives completed plans, and writes a run summary. The agent edits the target repo.

## Quick Start

Requirements:

- Node.js 20 or newer
- pnpm
- A working `codex` CLI on your `PATH`
- A target repository you want the agent to work on

Install Ralph from this repository:

```bash
pnpm install
pnpm build
pnpm link --global
```

Check that the command is available:

```bash
ralph --help
```

Create or copy a doc-plan queue:

```bash
mkdir -p ~/plans/my-project
cp examples/doc-plan/*.plan.md ~/plans/my-project/
```

Edit the copied plan files so they describe work for your target repository.

Preview the queue without changing files:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project \
  --dry-run
```

Run one plan:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project \
  --once
```

Drain all runnable plans:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project
```

Ralph writes a summary to:

```text
<plans>/ralph-summary.md
```

Completed plans are moved to:

```text
<plans>/done/
```

## How It Works

Ralph expects a folder of active plan files. Active plans must be direct children of the folder passed to `--plans`.

Supported active filenames:

- `*.plan.md`
- `*-plan.md`

Ralph does not recursively scan arbitrary subfolders. The only managed subfolder is `done/`, where completed plans are archived.

On each run, Ralph:

1. Reads active plans from `--plans`.
2. Reads completed plans from `<plans>/done/` for dependency resolution.
3. Selects the first runnable plan alphabetically, unless `--item` selects a specific one.
4. Marks the selected plan `in-progress`.
5. Runs the provider agent from the target repo.
6. Requires the agent to finish with a `ralph-result:` line.
7. Marks the plan `done` or `blocked`.
8. Runs a simplify/review pass unless `--no-simplify` is set.
9. Archives completed plans and updates the summary.

## Plan File Format

Each plan starts with metadata, followed by a blank line and the plan body:

```md
status: planned
created_at: 2026-05-21T12:00:00.000Z
updated_at: 2026-05-21T12:00:00.000Z
done_at: none
independent: yes
dependencies: none

# Add Health Endpoint

## Goal

Add a simple health endpoint to the application.

## Acceptance Criteria

- The app exposes `GET /health`.
- The endpoint returns a successful status code.
- Relevant tests or smoke checks pass.
```

Supported statuses:

- `planned`: runnable when dependencies are done
- `in-progress`: selected by Ralph and skipped by later runs until reset
- `done`: complete and archiveable
- `blocked`: not runnable; requires `blocked_reason`
- `skipped`: intentionally excluded

Dependencies are comma-separated plan basenames or paths relative to the plan directory:

```md
dependencies: 01-add-health-endpoint.plan.md, tests/02-add-smoke-test.plan.md
```

Only `done` satisfies a dependency.

## Example Plans

This repository includes a small sample queue in [examples/doc-plan](examples/doc-plan). Use it as a template:

```bash
cp -R examples/doc-plan ~/plans/my-project
```

The sample queue contains:

- `01-add-health-endpoint.plan.md`: an independent implementation plan
- `02-add-smoke-test.plan.md`: a dependent follow-up plan

Edit the examples before running them against a real repository.

## Common Commands

Preview queue health:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --dry-run
```

Run the next runnable plan only:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --once
```

Run all runnable plans:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project
```

Run one selected queue item:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project \
  --item 01-add-health-endpoint.plan.md
```

Run explicit plan files instead of a queue directory:

```bash
ralph \
  --repo ~/work/my-project \
  --plan ~/plans/my-project/01-add-health-endpoint.plan.md \
  --plan ~/plans/my-project/02-add-smoke-test.plan.md
```

Skip the simplify pass:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --no-simplify
```

Fail when the target repo has uncommitted changes:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --fail-on-dirty
```

## Provider Options

Codex is the supported provider in this version.

Use a specific model:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --model <model-name>
```

Use Codex reasoning effort:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --codex-level medium
ralph --repo ~/work/my-project --plans ~/plans/my-project --codex-level high
```

`--codex-level` accepts:

- `low`
- `medium`
- `high`
- `xhigh`

Use model tiers through environment variables:

```bash
export RALPH_MODEL_MEDIUM=<medium-model-name>
export RALPH_MODEL_HIGH=<high-model-name>

ralph --repo ~/work/my-project --plans ~/plans/my-project --model-tier medium
ralph --repo ~/work/my-project --plans ~/plans/my-project --model-tier high --codex-level high
```

Override the provider binary:

```bash
RALPH_CODEX_BIN=/path/to/codex ralph --repo ~/work/my-project --plans ~/plans/my-project
ralph --repo ~/work/my-project --plans ~/plans/my-project --agent-bin /path/to/codex
```

## Safety Notes

Ralph runs Codex with:

```text
--dangerously-bypass-approvals-and-sandbox
```

That allows unattended queue execution. Use Ralph only with plan files and repositories you trust.

If the target repo has uncommitted changes, Ralph warns and continues by default. The agent is instructed to preserve unrelated changes. Add `--fail-on-dirty` when you want automation to stop instead.

The implementation agent must end with exactly one of:

```text
ralph-result: done | <one sentence summary>
ralph-result: blocked | <one sentence blocker reason>
```

The simplify pass must end with exactly one of:

```text
ralph-simplify-result: done | <one sentence summary>
ralph-simplify-result: failed | <one sentence reason>
```

If a provider exits successfully but omits the required result line, Ralph leaves the plan `in-progress`, writes a summary failure, and exits non-zero.

## Retry Provider Limits

Retries are off by default. Enable retries for likely provider limit failures:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project \
  --retry-on-limit \
  --retry-delay-minutes 10 \
  --retry-max-attempts 4
```

Equivalent environment variables:

```bash
export RALPH_RETRY_ON_LIMIT=true
export RALPH_RETRY_DELAY_MINUTES=10
export RALPH_RETRY_MAX_ATTEMPTS=4
```

## Install From A Packed Tarball

```bash
pnpm build
npm pack
npm install -g ./ralph-loop-cli-0.1.0.tgz
```

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run test:ci
pnpm run build
```
