# Plan: Add Codex-Spark alongside OpenCode

## Goal

Refactor Xhoard's AI-processing integration into selectable providers, retaining the existing OpenCode SDK workflow while adding a Codex SDK workflow that runs the `gpt-5.3-codex-spark` model through the local Codex CLI authenticated with the user's ChatGPT subscription. New configurations will default to Codex; existing OpenCode configurations will remain usable without immediately requiring a migration.

## Approach

Introduce a canonical nested `ai` configuration in `xhoard.config.example.json`, with a selected provider, shared auto-invocation setting, and provider-specific model and timeout values. `src/config.js` will merge that nested configuration and translate the present `autoInvokeOpencode`, `opencodeModel`, `opencodeTimeout`, and their environment variables when a user has not yet migrated. New environment variables will be provider-neutral or Codex-specific (`AI_PROVIDER`, `AUTO_INVOKE_AI`, `CODEX_MODEL`, and `CODEX_TIMEOUT`).

Move the SDK-specific logic currently embedded in `src/job.js` behind a small provider dispatcher. The OpenCode implementation will keep its current session-command behavior. The new Codex implementation will use `@openai/codex-sdk`, start a one-shot thread in `projectRoot`/the working directory, select `gpt-5.3-codex-spark`, and supply the bookmark-processing prompt directly. It will inherit the user's existing Codex CLI login, so Xhoard will not read, write, or configure an API key. Both providers will return the same normalized result shape, allowing `src/job.js` to retain its pending-bookmark cleanup, locking, notifications, and error recovery behavior.

The processing instructions will have one source of truth that is loadable by the Codex provider and referenced by the retained `.opencode/commands/process-bookmarks.md` command. This preserves manual OpenCode use while keeping the two providers aligned on the archive-writing contract. The migration does not change bookmark fetching, archive schema, category rules, scheduler integration, or webhook payloads. It also does not attempt to make ChatGPT subscription authentication work in unattended environments that have not first completed `codex login`.

## Implementation Phases

### Phase 1: Establish provider configuration and compatibility

- Replace the AI-related top-level defaults in `xhoard.config.example.json` with an `ai` object whose default provider is `codex`, default model is `gpt-5.3-codex-spark`, and which still declares OpenCode's existing model and timeout settings.
- Update `src/config.js` to deep-merge `ai`, apply the new environment overrides, and normalize legacy `autoInvokeOpencode`, `opencodeModel`, `opencodeTimeout`, `AUTO_INVOKE_OPENCODE`, `OPENCODE_MODEL`, and `OPENCODE_TIMEOUT` into the canonical shape when appropriate.
- Update `src/cli.js` setup output and status reporting to create and display the selected provider rather than hard-coding OpenCode.
- Extend `test/config.test.js` with default-provider, nested-override, new-environment-variable, and legacy-configuration compatibility cases.

**Commit:** `refactor(config): add canonical AI provider configuration`

### Phase 2: Extract the provider boundary and add Codex-Spark

- Add `src/providers/index.js` as the provider selector and normalized invocation boundary used by `src/job.js`.
- Move the existing `createOpencode` session lifecycle from `src/job.js` into `src/providers/opencode.js`, preserving command invocation, timeout handling, output extraction, and normalized token-usage reporting.
- Add `src/providers/codex.js` using `@openai/codex-sdk` to run the shared processing prompt in `config.projectRoot` (or the current directory), pass the selected `gpt-5.3-codex-spark` model, surface final text and available usage, and report an actionable error when Codex CLI subscription login is unavailable.
- Add `src/providers/prompt.js` to load the package-shipped `.opencode/commands/process-bookmarks.md` command body directly, so Codex SDK execution and manual OpenCode command runs use the same rules without duplicating the prompt.
- Replace `invokeAICLI` and OpenCode-specific messages in `src/job.js` with provider-dispatch calls and provider-aware progress, success, disabled, and failure output, without changing pending-file cleanup or webhook behavior.
- Add provider-focused tests with mocked SDK boundaries covering selection, invalid provider names, Codex result normalization, provider failures, and the no-AI fallback path.
- Use Bun to add `@openai/codex-sdk` and refresh `bun.lock`, retaining `@opencode-ai/sdk` for the existing provider.
- Update `package.json` description and keywords for both providers while retaining the OpenCode command required by that provider.

**Commit:** `feat(providers): add Codex-Spark bookmark processing`

### Phase 3: Package and document both execution paths

- Remove the obsolete npm lockfile so Bun is the sole lockfile authority.
- Update `README.md`, `ecosystem.example.json`, and CLI help text to document provider selection, the default Codex-Spark flow, the `codex login` prerequisite for ChatGPT subscription use, OpenCode selection, relevant environment variables, and provider-specific troubleshooting.
- Run the complete Bun test suite plus focused configuration/provider tests, then manually smoke-test `bun src/cli.js status` with each provider configuration and a Codex-authentication failure that leaves pending bookmarks intact.

**Commit:** `docs(providers): document Codex and OpenCode configuration`

### Phase 4: Correct the Codex-Spark model identifier

- Replace the shorthand `codex-spark` identifier with the exact `gpt-5.3-codex-spark` identifier in configuration defaults, SDK fallback, documentation, and tests.
- Run an isolated ChatGPT-subscription smoke test that processes a disposable pending bookmark with the exact model and confirms archive output plus pending-file cleanup.

**Commit:** `fix(codex): use the full Codex-Spark model identifier`

## Risks & Tradeoffs

- The Codex SDK launches the local Codex CLI and relies on its persisted login. Scheduled or headless hosts must complete `codex login` first; the implementation should fail clearly and retain the pending batch when credentials are absent.
- `gpt-5.3-codex-spark` availability is account-dependent. Keeping `ai.codex.model` configurable gives users a supported escape hatch while making the requested model the default.
- A capable coding agent has filesystem access sufficient to write the archive. The shared prompt must keep writes constrained to the configured project/archive paths, and the existing lock and pending-file recovery must stay intact.
- Supporting legacy OpenCode settings increases normalization code temporarily. It avoids breaking existing installations and can be deprecated in a later major release.
- Codex and OpenCode expose different result and usage metadata. The dispatcher will normalize only the fields Xhoard actually consumes and treat unavailable usage values as absent rather than fabricating them.

## Open Questions

- None for the initial migration: use `gpt-5.3-codex-spark` as the default Codex model, retain OpenCode as an opt-in provider, and authenticate Codex through the existing ChatGPT subscription login.
