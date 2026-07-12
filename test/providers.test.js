import { describe, test } from 'node:test';
import assert from 'node:assert';
import { invokeCodex } from '../src/providers/codex.js';
import { invokeOpencode } from '../src/providers/opencode.js';
import { invokeAIProvider } from '../src/providers/index.js';

const config = {
  ai: {
    provider: 'codex',
    codex: { model: 'codex-spark', timeout: 1000 },
    opencode: { model: 'opencode/test-model', timeout: 1000 }
  }
};

describe('Codex provider', () => {
  test('runs codex-spark with subscription-compatible CLI options', async () => {
    let receivedOptions;
    let receivedPrompt;
    let receivedSignal;
    const result = await invokeCodex({
      config,
      bookmarkCount: 2,
      runDir: '/tmp/xhoard',
      createCodex: () => ({
        startThread(options) {
          receivedOptions = options;
          return {
            async run(prompt, { signal }) {
              receivedPrompt = prompt;
              receivedSignal = signal;
              return {
                finalResponse: 'Archived 2 bookmarks.',
                usage: {
                  input_tokens: 10,
                  cached_input_tokens: 4,
                  output_tokens: 6,
                  reasoning_output_tokens: 2
                }
              };
            }
          };
        }
      })
    });

    assert.deepStrictEqual(receivedOptions, {
      model: 'codex-spark',
      sandboxMode: 'workspace-write',
      workingDirectory: '/tmp/xhoard',
      skipGitRepoCheck: true,
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchEnabled: false
    });
    assert.match(receivedPrompt, /Read `\.\/\.state\/pending-bookmarks\.json`/);
    assert.match(receivedPrompt, /Process the 2 pending bookmark\(s\) now/);
    assert.ok(receivedSignal instanceof AbortSignal);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'Archived 2 bookmarks.');
    assert.deepStrictEqual(result.tokenUsage, {
      input: 10,
      output: 6,
      cacheRead: 4,
      cacheWrite: 0,
      subagentInput: 0,
      subagentOutput: 0,
      model: 'codex-spark',
      subagentModel: null
    });
  });

  test('explains how to restore subscription authentication', async () => {
    const result = await invokeCodex({
      config,
      bookmarkCount: 1,
      runDir: '/tmp/xhoard',
      createCodex: () => ({
        startThread() {
          return {
            async run() {
              throw new Error('Not logged in');
            }
          };
        }
      })
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error, /codex login/);
    assert.match(result.error, /ChatGPT subscription/);
  });
});

describe('OpenCode provider', () => {
  test('retains the session-command lifecycle and normalizes its result', async () => {
    let deleted = false;
    const result = await invokeOpencode({
      config,
      bookmarkCount: 3,
      runDir: '/tmp/xhoard',
      createClient: async () => ({
        server: { close() {} },
        client: {
          session: {
            async create() {
              return { data: { id: 'session-1' } };
            },
            async command(request) {
              assert.strictEqual(request.body.command, 'process-bookmarks');
              assert.strictEqual(request.body.arguments, '3');
              assert.strictEqual(request.body.model, 'opencode/test-model');
              return {
                data: {
                  info: {
                    providerID: 'opencode',
                    modelID: 'test-model',
                    tokens: { input: 7, output: 5, cache: { read: 2, write: 1 } }
                  },
                  parts: [{ type: 'text', text: 'Archived 3 bookmarks.' }]
                }
              };
            },
            async delete() {
              deleted = true;
            }
          }
        }
      })
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'Archived 3 bookmarks.');
    assert.strictEqual(result.tokenUsage.model, 'opencode/test-model');
    assert.strictEqual(deleted, true);
  });
});

describe('provider dispatcher', () => {
  test('selects the configured provider and adds runtime metadata', async () => {
    const result = await invokeAIProvider({
      config,
      bookmarkCount: 1,
      runDir: '/tmp/xhoard',
      providers: {
        codex: {
          displayName: 'Codex',
          runtime: 'Codex SDK',
          invoke: async () => ({ success: true, output: 'done', tokenUsage: {} })
        }
      }
    });

    assert.deepStrictEqual(result, {
      success: true,
      output: 'done',
      tokenUsage: {},
      provider: 'codex',
      providerName: 'Codex',
      runtime: 'Codex SDK'
    });
  });

  test('fails before work starts for an unsupported provider', async () => {
    const result = await invokeAIProvider({
      config: { ai: { provider: 'missing' } },
      bookmarkCount: 1,
      runDir: '/tmp/xhoard'
    });

    assert.deepStrictEqual(result, {
      success: false,
      error: 'Unsupported AI provider: missing'
    });
  });
});
