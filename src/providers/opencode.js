import { createOpencode } from '@opencode-ai/sdk';

function parseModel(model) {
  if (!model || typeof model !== 'string' || !model.includes('/')) {
    return null;
  }

  const [providerID, ...modelParts] = model.split('/');
  if (!providerID || modelParts.length === 0) {
    return null;
  }

  return { providerID, modelID: modelParts.join('/') };
}

function extractTextFromParts(parts = []) {
  return parts
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text)
    .join('\n\n');
}

function summarizeOpencodeError(result) {
  if (!result?.error) {
    return 'Unknown OpenCode SDK error';
  }

  const err = result.error;
  if (err?.data?.message) {
    return `${err.name}: ${err.data.message}`;
  }

  return err.name || 'Unknown OpenCode SDK error';
}

export async function invokeOpencode({ config, bookmarkCount, runDir, createClient = createOpencode }) {
  const providerConfig = config.ai?.opencode || {};
  const timeout = providerConfig.timeout || 900000;
  const model = providerConfig.model || 'opencode/glm-4.7-free';
  let timeoutId = null;
  let timedOut = false;
  let server = null;
  let client = null;
  let sessionId = null;

  try {
    const sdk = await createClient({ config: { model } });
    client = sdk.client;
    server = sdk.server;

    const createResult = await client.session.create({
      body: { title: `Xhoard bookmark batch ${new Date().toISOString()}` },
      query: { directory: runDir }
    });

    if (createResult.error) {
      throw new Error(summarizeOpencodeError(createResult));
    }

    sessionId = createResult.data.id;
    const parsedModel = parseModel(model);

    timeoutId = setTimeout(async () => {
      timedOut = true;
      try {
        await client.session.abort({
          path: { id: sessionId },
          query: { directory: runDir }
        });
      } catch {}
    }, timeout);

    const commandResult = await client.session.command({
      body: {
        command: 'process-bookmarks',
        arguments: String(bookmarkCount),
        ...(parsedModel ? { model } : {})
      },
      path: { id: sessionId },
      query: { directory: runDir }
    });

    if (timedOut) {
      return { success: false, error: `Timeout after ${timeout}ms` };
    }

    if (commandResult.error) {
      throw new Error(summarizeOpencodeError(commandResult));
    }

    const info = commandResult.data.info;
    return {
      success: true,
      output: extractTextFromParts(commandResult.data.parts || []),
      tokenUsage: {
        input: info.tokens?.input || 0,
        output: info.tokens?.output || 0,
        cacheRead: info.tokens?.cache?.read || 0,
        cacheWrite: info.tokens?.cache?.write || 0,
        subagentInput: 0,
        subagentOutput: 0,
        model: `${info.providerID}/${info.modelID}`,
        subagentModel: null
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'OpenCode SDK invocation failed'
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);

    if (client && sessionId) {
      try {
        await client.session.delete({
          path: { id: sessionId },
          query: { directory: runDir }
        });
      } catch {}
    }

    if (server) {
      try {
        server.close();
      } catch {}
    }
  }
}
