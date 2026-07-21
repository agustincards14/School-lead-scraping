## Purpose

Short, practical instructions for contributors and automated agents working on this repository. Favor simple, well-documented building blocks over heavy frameworks. Keep changes minimal, verifiable, and reversible. You are working for a solo developer who is creating tools to help grow a software business that is a next-gen platform for soccer teams to track their own stats. So the end user design should be minimal, clean, future-proof, while the implementation should be robust, maintainable, and easy to test. This will help ensure that the tools can evolve with the business needs without introducing unnecessary complexity or technical debt.

## Principles

- Prefer plain language, standard platform APIs, and the smallest dependency that solves the problem.
- Use modern, stable language features (ES2020+ / TypeScript latest stable) but avoid framework-specific abstractions when unnecessary.
- Make changes small and focused. One logical change per commit. Tests or a smoke check should accompany behavioral changes.
- Automate fast, repeatable checks (lint, typecheck, unit/smoke tests). Prefer local quick checks before adding CI runs.

## Project structure (minimal expectations)

- src/ or ./ — implementation code (small modules, explicit exports).
- tests/ and tests-examples/ — automated tests (Playwright tests live here in this repo).
- assets/ — static inputs and reference data.
- .github/ — docs and lightweight automation guidance (this file).

## Dependencies and tooling

- Favor standard tools that are well-documented and widely used. Examples in this repo use Node + Playwright. Keep other dependencies to a minimum and pin versions in lockfiles.
- Prefer built-in Node APIs, small utility libraries, or single-purpose packages when they reduce complexity.

## Code style and conventions

- Use clear, descriptive names. Functions should do one thing and return predictable data shapes.
- Prefer explicitness over cleverness. Avoid magic or hidden side-effects.
- Add brief inline comments only when the why is non-obvious. Let tests and small examples document behavior.

## Tests and verification

- Keep tests fast and deterministic. For scraping work, include a small offline fixture (like an MHTML or saved HTML) and a test that runs against it.
- Use Playwright for browser-based checks already present in this repo. When adding tests, include a happy-path case and one edge case.

## Data handling and privacy

- Treat any scraped or uploaded data as potentially sensitive. Do not commit secrets, API keys, or personal data.
- Keep CSV/TSV/JSON in `assets/` if they are reference fixtures. Prefer TSV for human readability when commas are common in fields.

## Minimal CI guidance

- CI should run lint, typecheck, and a minimal test suite. Keep CI shards small and fast. Don't run long-running full browser suites on every PR by default.

## For automated agents and reviewers

- Read the repository context and recent changes before editing files. Prefer targeted edits over large rewrites.
- When you modify code, run the project's quick verification steps (lint/typecheck/tests) and report results.
- Keep a short changelog entry in the commit message describing intent and risk (bugfix, feature, docs, refactor).
- Do not add new network calls or external integrations without explicit human approval. If a live request is necessary, document why and add a fallback offline test.

Agent chatbox / "Ask mode"
- If the human asks a question in the Agent chatbox, answer directly in chat ("Ask mode").
- Keep replies short and focused — target ~20% of the previous verbosity. Use 1–3 short sentences or a tiny code example when helpful.
- Don’t edit files, run network calls, or start background actions unless the user explicitly requests them.
- If edits are needed to demonstrate the result, answer first and ask for permission to change files.

## Developer workflow (quick)

1. Inspect the file(s) you intend to change. Keep edits minimal.
2. Run local checks (lint, typecheck, unit/smoke tests).
3. Commit with a clear message and open a PR for review.

Example (informational):
```bash
# Install deps
npm install

# Run tests (project uses Playwright)
npx playwright test
```

## When to prefer adding code versus scripting

- If the task is a one-off transform (file conversions, quick data fixes), prefer small scripts in `scripts/` or one-off Node scripts rather than adding heavy abstractions.
- If behavior will be reused or needs tests, add a small module in `src/` and cover it with tests.

## Troubleshooting and contacts

- Include small reproduction steps and the failing output when opening issues or PRs.
- For CI flakes, capture and attach logs/artifacts; retry only when necessary.

## Closing guidance

Small, well-tested, and clearly documented changes scale better than large framework-driven rewrites. Use good defaults: plain language, minimal dependencies, automated checks, and conservative edits.

Before making large changes, consider if the task can be solved with a small script or a targeted module. Otherwise, you must be 95% sure that it is the correct change to make. If in doubt, ask for feedback on your approach until I approve of the change.