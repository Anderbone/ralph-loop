# Repository Guidelines

## Project Structure & Module Organization

Ralph is a Node.js 20+ TypeScript CLI. Source files live in `src/` and compile to `dist/`, which is included in the published package. The CLI entry point is `src/cli.ts`; queue parsing and mutation logic is in `src/plans.ts`; provider execution is in `src/providers.ts`; summaries and shared types are in `src/summary.ts` and `src/types.ts`. Tests live in `tests/` and mirror the feature area, for example `tests/plans.test.ts`. Example doc-plan queues are under `examples/doc-plan/`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies from `pnpm-lock.yaml`.
- `pnpm build`: remove `dist/`, compile TypeScript, and make `dist/cli.js` executable.
- `pnpm typecheck`: type-check both source and tests without emitting files.
- `pnpm test`: run the Vitest suite once.
- `node dist/cli.js --help`: inspect the built CLI locally after running `pnpm build`.

Use pnpm for dependency and script execution. Avoid committing generated or local run artifacts such as `ralph-summary.md` unless they are intentional examples.

## Coding Style & Naming Conventions

Use strict TypeScript with ES modules and NodeNext resolution. Keep imports explicit, including `.js` extensions for local TypeScript modules so compiled output works in Node. Follow the existing two-space indentation, double quotes, semicolon-terminated style. Prefer small exported functions with descriptive camelCase names such as `buildQueueHealth` or `updatePlanStatus`. Use PascalCase for types and interfaces, for example `RunOptions`.

## Testing Guidelines

Tests use Vitest and Node temporary directories for integration-style filesystem checks. Name tests `*.test.ts` and place them in `tests/`. Add focused coverage for plan metadata parsing, queue selection, archive behavior, CLI argument parsing, and provider result handling when changing those areas. Run `pnpm test` and `pnpm typecheck` before opening a PR; run `pnpm build` when changes affect published CLI behavior or `dist/`.

## Commit & Pull Request Guidelines

The current history uses short imperative commit subjects, for example `Prepare Ralph for public doc-plan use` and `init`. Keep commits concise and scoped. Pull requests should describe the behavior change, list the commands run, and mention any changes to CLI flags, plan metadata format, archive behavior, or summary output. Include terminal output snippets or screenshots only when they clarify user-facing CLI behavior.

## Agent-Specific Instructions

When editing this repository, keep changes narrow and preserve the CLI’s documented contract in `README.md`. If source behavior changes, update tests and rebuild `dist/` when the checked-in distribution should reflect the new source.
