# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript source, organized by domain (`src/db/`, `src/date/`, `src/string/`, etc.).
- `utilities/`: build tooling (notably `utilities/buildBarrelFile.ts`).
- `dist/`: compiled output (generated; do not edit by hand).
- `logs/`: local runtime logs (generated).

This package uses a dual entry-point export strategy:
- `src/index.ts`: browser-safe exports.
- `src/node.ts`: includes Node-specific utilities.

Both barrel files are generated; add new modules under `src/**` and regenerate barrels rather than editing exports manually.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json`.
- `npm run clean`: remove `dist/`.
- `npm run build`: clean, regenerate barrel files, and compile TypeScript to `dist/`.
- `npm run build:barrel`: regenerate `src/index.ts` and `src/node.ts`.
- `npm run watch`: TypeScript watch + auto-regeneration workflow for local iteration.
- `npm run type-check`: run `tsc --noEmit` for a fast correctness check.
- `npm test`: run Vitest (expects tests under `test/` when present).

## Coding Style & Naming Conventions

- TypeScript (ESM; see `"type": "module"` in `package.json`), targeting ES2022.
- Formatting: Prettier (`tabWidth: 4`, `singleQuote: true`, `semi: true`, `printWidth: 140`).
- Linting: ESLint with TypeScript, import rules, SonarJS, and Prettier integration (`eslint.config.js`).
- Naming: prefer `camelCase` for values, `PascalCase` for types/classes; prefix booleans with `is/has/should/can/...`.

## Testing Guidelines

- Framework: Vitest.
- Conventions: place tests in `test/` and name files `*.test.ts`.
- Prefer unit tests over integration; avoid real AWS/DB calls (mock clients instead).

## Commit & Pull Request Guidelines

- Commits: follow the repo’s descriptive, sentence-style summaries (e.g., “Updated package version…”, “Enhanced DBMysql…”).
- PRs: include what/why, any API changes, and how you validated (`npm run type-check`, `npm run build`, and `npm test` if applicable).

## Security & Configuration Tips

- Keep secrets out of the repo; use environment variables (e.g., `GITHUB_PACKAGE_TOKEN` for publishing).
- Never log credentials or raw tokens; redact sensitive fields in errors and request logging.
