# TODO: Add Codex-Spark alongside OpenCode

## Phase 1: Establish provider configuration and compatibility

- [x] Replace top-level OpenCode defaults with canonical nested `ai` provider settings in `xhoard.config.example.json`.
- [x] Merge and normalize canonical, environment, and legacy AI settings in `src/config.js`.
- [x] Update setup and status provider messaging in `src/cli.js`.
- [x] Add canonical and legacy provider configuration coverage in `test/config.test.js`.
- [ ] Commit: `refactor(config): add canonical AI provider configuration`

## Phase 2: Extract the provider boundary and add Codex-Spark

- [ ] Add provider dispatch in `src/providers/index.js` and move OpenCode SDK execution to `src/providers/opencode.js`.
- [ ] Implement Codex SDK execution and subscription-login errors in `src/providers/codex.js`.
- [ ] Create one package-shipped bookmark-processing prompt and update `.opencode/commands/process-bookmarks.md` to use it.
- [ ] Wire `src/job.js` through the provider dispatcher without changing pending-file cleanup or notifications.
- [ ] Add mocked provider tests for Codex, OpenCode, invalid provider selection, failure retention, and the disabled path.
- [ ] Commit: `feat(providers): add Codex-Spark bookmark processing`

## Phase 3: Package and document both execution paths

- [ ] Add `@openai/codex-sdk` and refresh `bun.lock` using Bun; retain the OpenCode dependency and remove `package-lock.json`.
- [ ] Update `package.json` metadata and publish list for both providers and the shared prompt.
- [ ] Document provider selection, `codex login`, `codex-spark`, OpenCode fallback, and environment variables in `README.md`, `src/cli.js`, and `ecosystem.example.json`.
- [ ] Run the Bun test suite and focused configuration/provider tests.
- [ ] Smoke-test `bun src/cli.js status` with both `ai.provider` values and verify a failed Codex login leaves `pendingFile` unchanged.
- [ ] Commit: `docs(providers): document Codex and OpenCode configuration`

## Verification

- [ ] `bun test` passes with no changes to bookmark fetch, archive, category, or webhook behavior.
- [ ] `test/config.test.js` verifies `ai.provider: "codex"`, `ai.codex.model: "codex-spark"`, `AI_PROVIDER`/`CODEX_MODEL` overrides, and legacy `opencode*` configuration normalization.
- [ ] Provider tests verify each implementation returns the result consumed by `src/job.js` and rejects an unsupported provider before a pending batch is removed.
- [ ] Manual smoke test: after `codex login`, run `bun src/cli.js run --limit 1` with the Codex provider and confirm exactly one pending bookmark is archived and removed.
- [ ] Manual smoke test: select `ai.provider: "opencode"`, run the same limited batch, and confirm existing OpenCode command behavior remains available.
- [ ] Edge case: an expired/missing Codex subscription login, a timeout, or provider error returns failure and preserves all pending bookmark IDs.
- [ ] No behavior change in `src/processor.js` fetching, archive output locations, pending-file cleanup semantics, lock management, or Slack/Discord notification payloads.

## Review

- [ ] Code reviewed.
- [ ] `PLAN.md` updated if the Codex SDK's verified API requires an approach change.
- [ ] All phase commits are clean and describe their intent.
- [ ] TODO.md items all checked off.
