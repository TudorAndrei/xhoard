import { invokeCodex } from './codex.js';
import { invokeOpencode } from './opencode.js';

const PROVIDERS = {
  codex: {
    displayName: 'Codex',
    runtime: 'Codex SDK',
    invoke: invokeCodex
  },
  opencode: {
    displayName: 'OpenCode',
    runtime: 'OpenCode SDK',
    invoke: invokeOpencode
  }
};

export function getProviderName(provider) {
  return PROVIDERS[provider]?.displayName || provider || 'AI';
}

export async function invokeAIProvider({ config, bookmarkCount, runDir, providers = PROVIDERS }) {
  const provider = config.ai?.provider;
  const definition = providers[provider];

  if (!definition) {
    return {
      success: false,
      error: `Unsupported AI provider: ${provider || '(not configured)'}`
    };
  }

  const result = await definition.invoke({ config, bookmarkCount, runDir });
  return {
    ...result,
    provider,
    providerName: definition.displayName,
    runtime: definition.runtime
  };
}
