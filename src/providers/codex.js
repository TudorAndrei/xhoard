import { Codex } from '@openai/codex-sdk';
import { loadBookmarkProcessingPrompt } from './prompt.js';

function isAuthenticationError(error) {
  return /auth(?:entication)?|log(?:ged)?\s*in|unauthori[sz]ed|subscription/i.test(error.message || '');
}

function normalizeUsage(usage, model) {
  return {
    input: usage?.input_tokens || 0,
    output: usage?.output_tokens || 0,
    cacheRead: usage?.cached_input_tokens || 0,
    cacheWrite: 0,
    subagentInput: 0,
    subagentOutput: 0,
    model,
    subagentModel: null
  };
}

export async function invokeCodex({ config, bookmarkCount, runDir, createCodex = () => new Codex() }) {
  const providerConfig = config.ai?.codex || {};
  const timeout = providerConfig.timeout || 900000;
  const model = providerConfig.model || 'gpt-5.3-codex-spark';
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    // Do not pass an API key: the Codex CLI inherits its existing ChatGPT
    // subscription login from the local environment.
    const codex = createCodex();
    const thread = codex.startThread({
      model,
      sandboxMode: 'workspace-write',
      workingDirectory: runDir,
      skipGitRepoCheck: true,
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchEnabled: false
    });
    const prompt = `${loadBookmarkProcessingPrompt()}\n\nProcess the ${bookmarkCount} pending bookmark(s) now.`;
    const turn = await thread.run(prompt, { signal: controller.signal });

    if (timedOut) {
      return { success: false, error: `Timeout after ${timeout}ms` };
    }

    return {
      success: true,
      output: turn.finalResponse,
      tokenUsage: normalizeUsage(turn.usage, model)
    };
  } catch (error) {
    if (timedOut || error.name === 'AbortError') {
      return { success: false, error: `Timeout after ${timeout}ms` };
    }

    if (isAuthenticationError(error)) {
      return {
        success: false,
        error: 'Codex authentication failed. Run `codex login` in this environment to use your ChatGPT subscription.'
      };
    }

    return {
      success: false,
      error: error.message || 'Codex SDK invocation failed'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
