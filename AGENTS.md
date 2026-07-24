# Repository Guidelines

## Project Overview

`@einhaus/meteoric-helpers` is a shared ESM TypeScript utility library used across multiple projects. It provides browser-safe helpers, server-runtime utilities, database clients and type generators, date and market-time functions, caching, logging, file handling, and other focused utilities.

## User-Facing Communication

- Lead with the answer, result, or current status.
- Use plain English, short sentences, and concrete wording.
- Keep the response proportional to the request. Explain technical details only when they help the user understand, verify, decide, or act.
- Avoid jargon and internal names unless necessary. Briefly define unavoidable technical terms.
- Do not repeat the request, narrate every command, list every inspected file, or dump raw output.
- Keep progress updates to one or two sentences and report only meaningful progress, decisions, results, or blockers.
- If a response has several major findings or is longer than roughly 400 words, begin with an **In short:** synopsis stating the conclusion, impact, and required user action.
- For completed work, normally state what changed, what was verified, and any material limitation or remaining action. Omit empty sections.
- Include **Next steps** only when meaningful action remains. Mark actions **Required** or **Optional**, list required actions first, and normally include no more than three.
- If the work is complete and no action is needed, say so plainly. Do not invent follow-up work or end with a generic offer of more help.
- Do not remove important risks or caveats merely to make a response shorter.

## Planning and Engineering Approach

- Keep plans proportional to the task. For simple work, state the intended change briefly and proceed.
- For complex work, plan only meaningful decisions, dependencies, risks, and verification. Omit routine mechanics.
- Recommend one approach when possible. Present alternatives only when there is a real tradeoff or user decision.
- Separate required work from optional improvements. Do not expand the requested scope merely because related improvements are possible.
- Prefer the simplest sound architecture that fully meets current requirements and realistically expected scale.
- Robustness requires appropriate validation, error handling, observability, tests, and performance. It does not require speculative abstractions or generalized frameworks.
- Do not add a compatibility layer, feature flag, dependency, framework, or reusable abstraction unless a concrete current requirement or clear near-term benefit justifies it.
- Prefer a focused local change over a broad redesign when both solve the problem well.
- Do not build for imagined future use cases. Leave a clear path for later extension instead of implementing it now.
- When additional complexity is necessary, briefly identify the specific requirement, scale concern, or failure risk that justifies it.
- Keep implementation and verification effort proportional to the task's risk and impact. Simplicity must not be used to skip correctness or necessary safeguards.
- Preserve unrelated tracked and untracked files.

## Project Structure & Module Organization

- `src/`: TypeScript source, organized by domain (`src/db/`, `src/date/`, `src/string/`, etc.).
- `utilities/`: build tooling (notably `utilities/buildBarrelFile.ts`).
- `dist/`: compiled output (generated; do not edit by hand).
- `logs/`: local runtime logs (generated).

This package uses a dual entry-point export strategy:

- `src/index.ts`: browser-safe exports.
- `src/node.ts`: includes server-runtime utilities (Bun runtime; Node-compatible built-ins like `fs`, `path`, `crypto`).

Both barrel files are generated; add new modules under `src/**` and regenerate barrels rather than editing exports manually.

### Module Domains

- `array/`, `object/`, `string/`, `math/`, and `path/` contain focused general-purpose helpers.
- `date/` contains date, timezone, trading-calendar, and market-time utilities.
- `cache/` contains local and Redis-backed caching.
- `db/` contains typed database clients and MySQL/Postgres type generation.
- `file/` contains server-runtime file, compression, and S3 helpers.
- `misc/` contains cross-cutting utilities such as logging and email support.

## Build, Test, and Development Commands

- `bun install --frozen-lockfile`: install dependencies from `bun.lock`.
- `bun run clean`: remove `dist/`.
- `bun run build`: clean, regenerate barrel files, and compile TypeScript to `dist/`.
- `bun run build:barrel`: regenerate `src/index.ts` and `src/node.ts`.
- `bun run watch`: TypeScript watch + auto-regeneration workflow for local iteration.
- `bun run type-check`: run `tsc --noEmit` for a fast correctness check.
- `bun run test`: run Vitest (expects tests under `test/` when present).
- `bun publish`: publish using the registry and access settings in `package.json`; publishing requires `GITHUB_PACKAGE_TOKEN`.

## Coding Style & Naming Conventions

- TypeScript (ESM; see `"type": "module"` in `package.json`), targeting ES2022.
- Formatting: Oxfmt (`tabWidth: 4`, `singleQuote: true`, `semi: true`, `printWidth: 140`).
- Linting: Oxlint with its TypeScript 7-native type-aware engine and built-in import rules (`.oxlintrc.json`).
- Naming: prefer `camelCase` for values, `PascalCase` for types/classes; prefix booleans with `is/has/should/can/...`.

## Testing Guidelines

- Framework: Vitest.
- Conventions: place tests in `test/` and name files `*.test.ts`.
- Prefer unit tests over integration; avoid real AWS/DB calls (mock clients instead).

## Commit & Pull Request Guidelines

- Commits: follow the repo’s descriptive, sentence-style summaries (e.g., “Updated package version…”, “Enhanced DBMysql…”).
- PRs: include what/why, any API changes, and how you validated (`bun run type-check`, `bun run build`, and `bun run test` if applicable).

## Security & Configuration Tips

- Keep secrets out of the repo; use environment variables (e.g., `GITHUB_PACKAGE_TOKEN` for publishing).
- Never log credentials or raw tokens; redact sensitive fields in errors and request logging.
