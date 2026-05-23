status: planned
created_at: 2026-05-21T12:05:00.000Z
updated_at: 2026-05-21T12:05:00.000Z
done_at: none
independent: no
dependencies: 01-add-health-endpoint.plan.md

# Add Smoke Test

## Goal

Add a lightweight smoke test or script that checks the health endpoint added by the previous plan.

## Context

Follow the target repository's existing test style. Prefer a small automated check over a broad end-to-end suite.

## Acceptance Criteria

- The smoke test verifies that the health endpoint returns a successful response.
- The test can run from an existing test command or from a clearly documented script.
- Existing tests still pass.

## Verification

- Run the new smoke test.
- Run the nearest existing test command that covers the changed area.
