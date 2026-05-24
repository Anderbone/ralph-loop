---
name: implementation-plan
description: Create Ralph-ready implementation plan files for AI coding queues. Use when the user asks to write a plan first, create a doc-plan, turn notes into executable queue items, or identify open questions before implementation.
---

# Ralph Implementation Plan

Create a `*.plan.md` file that Ralph can execute with minimal ambiguity.

## Workflow

1. Inspect local conventions first:
   - Read the target repository's `AGENTS.md` if present.
   - Sample nearby plans when writing into an existing Ralph queue.
   - Inspect enough code, tests, and docs to avoid asking questions the repository can answer.
2. Start every Ralph plan with this metadata block:

   ```md
   status: planned
   created_at: 2026-05-21T12:00:00.000Z
   updated_at: 2026-05-21T12:00:00.000Z
   done_at: none
   independent: yes
   dependencies: none
   ```

   Use exact ISO 8601 timestamps. Set `created_at` and `updated_at` when creating the plan, update `updated_at` whenever the plan changes, and set `done_at` only when `status: done`. Use `independent: no` and fill `dependencies:` with comma-separated Ralph plan filenames when this plan must wait for other plans.
3. Put unresolved human decisions near the top:

   ```md
   ## Open Questions

   - None.
   ```

   If there are real unresolved decisions, write each one as:

   ```md
   - Question: ...
     Recommended answer: ...
     Why it matters: ...
   ```
4. Prefer this body shape:
   - `# <Feature> Plan`
   - `## Open Questions`
   - `## Goal`
   - `## Current State`
   - `## Scope`
   - `## Non-Goals`
   - `## Implementation Tasks`
   - `## Guardrails`
   - `## Verification`
5. Make tasks codeable:
   - Name likely files, modules, routes, schemas, commands, docs, and tests.
   - Keep each plan small enough for one Ralph run.
   - Include migration, data, permission, compatibility, and rollback notes when relevant.
   - State exact verification commands when the target repository defines them.
6. Balance open questions:
   - Resolve questions yourself when existing code, docs, or policy provide a clear answer.
   - Ask only for decisions that materially affect behavior, scope, data loss, security, public contracts, cost, schedule, or UX.
   - If blocked, ask one question at a time and include your recommended answer.

## Output Rules

- If the user asks for a plan file, create or edit the `*.plan.md` file.
- If the user asks for advice only, provide the recommended plan structure and highest-risk open questions.
- Do not implement the plan unless the user explicitly asks for implementation work.
