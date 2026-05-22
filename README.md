# Ralph

Ralph is a global CLI that drains a directory of implementation plans against a target repository.

It is designed for this workflow:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --provider codex
```

By default Ralph keeps running runnable plans until the queue is empty or `--max-items` is reached. Use `--once` when you want one plan only.

## Install

From this repository:

```bash
pnpm install
pnpm build
pnpm link --global
```

Then check:

```bash
ralph --help
```

You can also pack and install it with npm:

```bash
pnpm build
npm pack
npm install -g ./ralph-loop-cli-0.1.0.tgz
```

## Plan Queue

Active plans are direct `*.plan.md` or `*-plan.md` children of the directory passed to `--plans`. Ralph does not recursively scan arbitrary subfolders, and it does not treat files like `README.md` as queue items. The only managed subfolder is:

```text
<plans>/done/
```

Completed plans are archived there. If an archived filename already exists, Ralph appends a timestamp before `.plan.md`.

Each plan should start with metadata like this:

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
- `in-progress`: currently selected by Ralph
- `done`: complete and archiveable
- `blocked`: not runnable; requires `blocked_reason`
- `skipped`: intentionally excluded

Dependencies are comma-separated plan basenames or paths relative to the plan directory:

```md
dependencies: setup-auth.plan.md, api/create-user.plan.md
```

Only `done` satisfies a dependency.

## Common Commands

Dry-run queue health:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --dry-run
```

Drain the whole queue:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan
```

Run only one plan:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --once
```

Run one selected queue item:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plans /home/jiyu/Documents/Jiyu-obsidian/demo-aidesk/plan \
  --item add-login.plan.md
```

Run explicit plan files:

```bash
ralph \
  --repo ~/github/demo-projects/opsdesk-ai \
  --plan /tmp/plans/one.plan.md \
  --plan /tmp/plans/two.plan.md
```

## Codex Model And Reasoning

Codex is the first supported provider.

Use an exact model:

```bash
ralph --repo ~/project --plans ~/plans --model gpt-5.4
```

Use Codex reasoning effort directly:

```bash
ralph --repo ~/project --plans ~/plans --codex-level medium
ralph --repo ~/project --plans ~/plans --codex-level high
```

`--codex-level` accepts:

- `low`
- `medium`
- `high`
- `xhigh`

Ralph passes this to Codex as `model_reasoning_effort`.

You can combine model and reasoning:

```bash
ralph \
  --repo ~/project \
  --plans ~/plans \
  --model gpt-5.4 \
  --codex-level high
```

You can also use model tiers through environment variables:

```bash
export RALPH_MODEL_MEDIUM=gpt-5.4
export RALPH_MODEL_HIGH=gpt-5.5

ralph --repo ~/project --plans ~/plans --model-tier medium
ralph --repo ~/project --plans ~/plans --model-tier high --codex-level high
```

Provider binary overrides:

```bash
RALPH_CODEX_BIN=/path/to/codex ralph --repo ~/project --plans ~/plans
ralph --repo ~/project --plans ~/plans --agent-bin /path/to/codex
```

## Safety Behavior

Ralph itself only mutates plan metadata, archives completed plans, and writes the summary file. The provider agent is responsible for target repo edits.

For Codex, Ralph always runs in YOLO mode with:

```text
--dangerously-bypass-approvals-and-sandbox
```

That keeps the queue unattended: Codex can run commands and edit files without stopping for approval prompts.

If the target repo is dirty, Ralph warns and continues:

```bash
ralph --repo ~/project --plans ~/plans
```

For automation, fail instead:

```bash
ralph --repo ~/project --plans ~/plans --fail-on-dirty
```

The implementation agent must finish with:

```text
ralph-result: done | <one sentence>
```

or:

```text
ralph-result: blocked | <one sentence>
```

Ralph owns final plan metadata transitions. If the provider exits successfully but omits the result line, Ralph leaves the plan `in-progress`, writes a summary failure, and exits non-zero.

The simplify pass runs after successful implementation unless disabled:

```bash
ralph --repo ~/project --plans ~/plans --no-simplify
```

If simplify fails, Ralph still archives the completed implementation plan, records the simplify failure in the summary, and exits non-zero.

## Retry Provider Limits

Retries are off by default. Enable retries for likely provider limit failures:

```bash
ralph \
  --repo ~/project \
  --plans ~/plans \
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

## Development

```bash
pnpm install
pnpm run typecheck
pnpm run test:ci
pnpm run build
```
