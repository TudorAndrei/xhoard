# Plan: Add Codex-Spark alongside OpenCode

## Goal

Refactor Xhoard's AI-processing integration into selectable providers, retaining the existing OpenCode SDK workflow while adding a Codex SDK workflow that runs the `codex-spark` model through the local Codex CLI authenticated with the user's ChatGPT subscription. New configurations will default to Codex; existing OpenCode configurations will remain usable without immediately requiring a migration.

## Approach

Introduce a canonical nested `ai` configuration in `xhoard.config.example.json`, with a selected provider, shared auto-invocation setting, and provider-specific model and timeout values. `src/config.js` will merge that nested configuration and translate the present `autoInvokeOpencode`, `opencodeModel`, `opencodeTimeout`, and their environment variables when a user has not yet migrated. New environment variables will be provider-neutral or Codex-specific (`AI_PROVIDER`, `AUTO_INVOKE_AI`, `CODEX_MODEL`, and `CODEX_TIMEOUT`).

Move the SDK-specific logic currently embedded in `src/job.js` behind a small provider dispatcher. The OpenCode implementation will keep its current session-command behavior. The new Codex implementation will use `@openai/codex-sdk`, start a one-shot thread in `projectRoot`/the working directory, select `codex-spark`, and supply the bookmark-processing prompt directly. It will inherit the user's existing Codex CLI login, so Xhoard will not read, write, or configure an API key. Both providers will return the same normalized result shape, allowing `src/job.js` to retain its pending-bookmark cleanup, locking, notifications, and error recovery behavior.

The processing instructions will have one source of truth that is loadable by the Codex provider and referenced by the retained `.opencode/commands/process-bookmarks.md` command. This preserves manual OpenCode use while keeping the two providers aligned on the archive-writing contract. The migration does not change bookmark fetching, archive schema, category rules, scheduler integration, or webhook payloads. It also does not attempt to make ChatGPT subscription authentication work in unattended environments that have not first completed `codex login`.

## Implementation Phases

### Phase 1: Establish provider configuration and compatibility

- Replace the AI-related top-level defaults in `xhoard.config.example.json` with an `ai` object whose default provider is `codex`, default model is `codex-spark`, and which still declares OpenCode's existing model and timeout settings.
- Update `src/config.js` to deep-merge `ai`, apply the new environment overrides, and normalize legacy `autoInvokeOpencode`, `opencodeModel`, `opencodeTimeout`, `AUTO_INVOKE_OPENCODE`, `OPENCODE_MODEL`, and `OPENCODE_TIMEOUT` into the canonical shape when appropriate.
- Update `src/cli.js` setup output and status reporting to create and display the selected provider rather than hard-coding OpenCode.
- Extend `test/config.test.js` with default-provider, nested-override, new-environment-variable, and legacy-configuration compatibility cases.

**Commit:** `refactor(config): add canonical AI provider configuration`

### Phase 2: Extract the provider boundary and add Codex-Spark

- Add `src/providers/index.js` as the provider selector and normalized invocation boundary used by `src/job.js`.
- Move the existing `createOpencode` session lifecycle from `src/job.js` into `src/providers/opencode.js`, preserving command invocation, timeout handling, output extraction, and normalized token-usage reporting.
- Add `src/providers/codex.js` using `@openai/codex-sdk` to run the shared processing prompt in `config.projectRoot` (or the current directory), pass the selected `codex-spark` model, surface final text and available usage, and report an actionable error when Codex CLI subscription login is unavailable.
- Move the bookmark-processing instructions into a package-shipped shared prompt file, and reduce `.opencode/commands/process-bookmarks.md` to reference that source so OpenCode's manual command and Codex SDK execution use the same rules.
- Replace `invokeAICLI` and OpenCode-specific messages in `src/job.js` with provider-dispatch calls and provider-aware progress, success, disabled, and failure output, without changing pending-file cleanup or webhook behavior.
- Add provider-focused tests with mocked SDK boundaries covering selection, invalid provider names, Codex result normalization, provider failures, and the no-AI fallback path.

**Commit:** `feat(providers): add Codex-Spark bookmark processing`

### Phase 3: Package and document both execution paths

- Use Bun to add `@openai/codex-sdk`, retain `@opencode-ai/sdk`, refresh `bun.lock`, and remove the obsolete npm lockfile so Bun is the sole lockfile authority.
- Update `package.json` keywords and published-file entries for the shared prompt while retaining the OpenCode command required by that provider.
- Update `README.md`, `ecosystem.example.json`, and CLI help text to document provider selection, the default Codex-Spark flow, the `codex login` prerequisite for ChatGPT subscription use, OpenCode selection, relevant environment variables, and provider-specific troubleshooting.
- Run the complete Bun test suite plus focused configuration/provider tests, then manually smoke-test `bun src/cli.js status` with each provider configuration and a Codex-authentication failure that leaves pending bookmarks intact.

**Commit:** `docs(providers): document Codex and OpenCode configuration`

## Risks & Tradeoffs

- The Codex SDK launches the local Codex CLI and relies on its persisted login. Scheduled or headless hosts must complete `codex login` first; the implementation should fail clearly and retain the pending batch when credentials are absent.
- `codex-spark` availability is account-dependent. Keeping `ai.codex.model` configurable gives users a supported escape hatch while making the requested model the default.
- A capable coding agent has filesystem access sufficient to write the archive. The shared prompt must keep writes constrained to the configured project/archive paths, and the existing lock and pending-file recovery must stay intact.
- Supporting legacy OpenCode settings increases normalization code temporarily. It avoids breaking existing installations and can be deprecated in a later major release.
- Codex and OpenCode expose different result and usage metadata. The dispatcher will normalize only the fields Xhoard actually consumes and treat unavailable usage values as absent rather than fabricating them.

## Open Questions

- None for the initial migration: use `codex-spark` as the default Codex model, retain OpenCode as an opt-in provider, and authenticate Codex through the existing ChatGPT subscription login.
