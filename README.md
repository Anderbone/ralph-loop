# Ralph

Ralph is a small TypeScript CLI that runs a folder of implementation plans through Codex one item at a time.

It is useful when you already have a queue of `*.plan.md` files and want an unattended agent loop that can:

- pick the next runnable plan
- respect simple dependencies between plans
- mark plans `in-progress`, `done`, or `blocked`
- archive completed plans into `done/`
- write a Markdown run summary
- run a follow-up simplify/review pass after each completed plan

Ralph is intentionally narrow. It does not write plans for you, manage a backlog, or hide what the agent is doing. It only coordinates doc-plan execution and keeps queue files tidy.

## Who This Is For

Use Ralph if you:

- keep implementation work in Markdown plan files
- use Codex from the command line
- want to drain a small, trusted queue without manually starting each task
- care about preserving simple audit history in plain files

Do not use Ralph as a general CI runner, job scheduler, or task database. It is a local automation loop for trusted repositories and trusted plans.

## Requirements

- Node.js 20 or newer
- pnpm
- Git
- A working `codex` CLI on your `PATH`
- A target repository that the agent is allowed to edit

Ralph runs Codex with `--dangerously-bypass-approvals-and-sandbox` so it can operate unattended. Only run queues and repositories you trust.

## Install

From a checkout:

```bash
git clone https://github.com/Anderbone/ralph-loop.git
cd ralph-loop
pnpm install
pnpm build
pnpm link --global
```

Or install directly from GitHub:

```bash
pnpm add --global github:Anderbone/ralph-loop
```

Check the binary:

```bash
ralph --help
```

## Five-Minute Demo

Copy the example queue somewhere outside this repository:

```bash
mkdir -p ~/plans
cp -R examples/doc-plan ~/plans/ralph-demo
```

Preview queue health before mutating anything:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/ralph-demo \
  --dry-run
```

Expected shape:

```text
# Ralph Queue Health

Runnable: 1
Waiting: 2
Blocked: 0
Skipped: 0
Done: 0
Warnings: 0
Failures: 0

## Runnable
- 01-add-health-endpoint.plan.md

## Waiting
- 02-add-smoke-test.plan.md
- 03-document-health-check.plan.md
```

Run the next item only:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/ralph-demo \
  --once
```

Drain every runnable item:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/ralph-demo
```

After a successful run, Ralph writes:

```text
~/plans/ralph-demo/ralph-summary.md
~/plans/ralph-demo/done/<completed-plan>.plan.md
```

## Plan File Format

Each active plan is a Markdown file with metadata at the top, followed by a blank line and the plan body:

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
dependencies: 01-add-health-endpoint.plan.md, 02-add-smoke-test.plan.md
```

Only `done` satisfies a dependency.

## Writing Plans

Ralph executes plans, but it does not need to be the tool that writes them. A good Ralph plan is a small implementation brief that another coding agent can execute without asking obvious follow-up questions.

This repository includes two authoring helpers:

- [examples/templates/implementation-plan.template.md](examples/templates/implementation-plan.template.md): a copyable Ralph plan template
- [examples/skills/implementation-plan/SKILL.md](examples/skills/implementation-plan/SKILL.md): an optional Codex skill for creating Ralph-ready plans

The recommended plan body structure is:

```md
# <Feature> Plan

## Open Questions

## Goal

## Current State

## Scope

## Non-Goals

## Implementation Tasks

## Guardrails

## Verification
```

Use `## Open Questions` for decisions a human really needs to make before Ralph runs the plan. If there are no unresolved decisions, write `- None.`.

Use `## Implementation Tasks` for concrete, codeable steps. Name likely files, modules, routes, tests, commands, and documentation when you know them. Keep each plan narrow enough for one Ralph run.

### Complete Plan Example

Save this as `~/plans/my-project/01-add-health-endpoint.plan.md`:

```md
status: planned
created_at: 2026-05-21T12:00:00.000Z
updated_at: 2026-05-21T12:00:00.000Z
done_at: none
independent: yes
dependencies: none

# Add Health Endpoint Plan

## Open Questions

- None.

## Goal

Add a small health endpoint that confirms the application process is running.

## Current State

The target repository already has an HTTP server and test setup. Follow its existing routing, response, and test conventions instead of introducing a new framework.

## Scope

- Add `GET /health` or the closest equivalent route for the existing server framework.
- Return a successful status code and a compact JSON body such as `{ "ok": true }`.
- Add or update a focused route test when the repository already has route tests.

## Non-Goals

- Do not add authentication, readiness checks, database checks, or external service checks.
- Do not reorganize the server structure beyond what is required for the endpoint.

## Implementation Tasks

1. Read the target repository instructions and inspect the server entry point, router setup, and nearest route tests.
2. Add the health route using the existing routing style.
3. Add or update the smallest matching test for the route.
4. Update existing developer documentation only if the repository already documents available endpoints.

## Guardrails

- Preserve unrelated user changes.
- Keep the endpoint simple and deterministic.
- Follow existing code style, module boundaries, and test patterns.

## Verification

- Run the relevant route test or the target repository's normal test command.
- If there is no automated test setup, run the smallest manual smoke check and report the command in the final result.
```

### Daily Workflow

Start with a queue folder outside the repository Ralph will edit:

```bash
mkdir -p ~/plans/my-project
cp examples/templates/implementation-plan.template.md ~/plans/my-project/01-my-change.plan.md
```

Write the plan yourself, or ask Codex to write one from the skill:

```text
Use the implementation-plan skill to create ~/plans/my-project/01-add-health-endpoint.plan.md for adding a health endpoint to ~/work/my-project. Inspect the repo first and make the plan Ralph-ready. Do not implement it.
```

If your Codex setup supports local skills, you can install the included Ralph plan skill:

```bash
mkdir -p ~/.agents/skills/implementation-plan
cp examples/skills/implementation-plan/SKILL.md ~/.agents/skills/implementation-plan/SKILL.md
```

Preview the queue before anything mutates:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project \
  --dry-run
```

Run the first plan only:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project \
  --once
```

Review the target repository changes and the generated summary:

```bash
cd ~/work/my-project
git status --short
git diff
sed -n '1,200p' ~/plans/my-project/ralph-summary.md
```

When the first run looks good, continue draining the queue:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project
```

For a dependent follow-up plan, set `independent: no` and name the dependency:

```md
status: planned
created_at: 2026-05-21T12:05:00.000Z
updated_at: 2026-05-21T12:05:00.000Z
done_at: none
independent: no
dependencies: 01-add-health-endpoint.plan.md
```

Ralph will wait until the dependency is marked `done` and archived into `done/`.

## Queue Rules

Ralph expects active plans to be direct children of the folder passed to `--plans`.

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

## Common Commands

Preview queue health:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --dry-run
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

Stop after a fixed number of items:

```bash
ralph --repo ~/work/my-project --plans ~/plans/my-project --max-items 3
```

Retry likely provider rate-limit failures:

```bash
ralph \
  --repo ~/work/my-project \
  --plans ~/plans/my-project \
  --retry-on-limit \
  --retry-delay-minutes 10 \
  --retry-max-attempts 4
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

Resolve models from environment variables:

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

## Example Plans

The sample queue in [examples/doc-plan](examples/doc-plan) shows a three-step flow:

- `01-add-health-endpoint.plan.md`: independent implementation work
- `02-add-smoke-test.plan.md`: waits for the health endpoint
- `03-document-health-check.plan.md`: waits for the smoke test

Use these as templates, then rewrite the goals and acceptance criteria for your target repository.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
node dist/cli.js --help
```

Source files live in `src/` and compile to `dist/`, which is included in the package. Tests live in `tests/` and use Vitest.

## Static Site

This repository includes a small GitHub Pages-ready landing page at [docs/index.html](docs/index.html).

To serve it locally:

```bash
python3 -m http.server 8000 -d docs
```

Then open `http://localhost:8000`.

## Safety Notes

Ralph passes this flag to Codex:

```text
--dangerously-bypass-approvals-and-sandbox
```

That is the point of the tool: unattended execution of trusted plan queues. Keep these guardrails in place:

- preview queues with `--dry-run`
- keep plans small and reviewable
- use `--once` for a new queue until you trust it
- use `--fail-on-dirty` when you want a clean target repo requirement
- read `ralph-summary.md` after runs

## License

MIT
