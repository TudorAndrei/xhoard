import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expandTilde, loadConfig } from '../src/config.js';

function loadIsolatedConfig(data = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xhoard-config-'));
  const configPath = path.join(directory, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(data));

  try {
    return loadConfig(configPath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe('expandTilde', () => {
  test('expands ~/ to home directory', () => {
    const result = expandTilde('~/Documents/bookmarks.md');
    assert.strictEqual(result, path.join(os.homedir(), 'Documents/bookmarks.md'));
  });

  test('expands bare ~ to home directory', () => {
    const result = expandTilde('~');
    assert.strictEqual(result, os.homedir());
  });

  test('returns absolute paths unchanged', () => {
    const result = expandTilde('/usr/local/bin');
    assert.strictEqual(result, '/usr/local/bin');
  });

  test('returns relative paths unchanged', () => {
    const result = expandTilde('./bookmarks.md');
    assert.strictEqual(result, './bookmarks.md');
  });

  test('handles null gracefully', () => {
    const result = expandTilde(null);
    assert.strictEqual(result, null);
  });

  test('handles undefined gracefully', () => {
    const result = expandTilde(undefined);
    assert.strictEqual(result, undefined);
  });

  test('handles non-string gracefully', () => {
    const result = expandTilde(123);
    assert.strictEqual(result, 123);
  });
});

describe('loadConfig', () => {
  test('returns default config when no file exists', () => {
    const config = loadIsolatedConfig();
    assert.ok(config.archiveFile);
    assert.ok(config.pendingFile);
    assert.ok(config.stateFile);
    assert.deepStrictEqual(config.folders, {});
  });

  test('default categories are present', () => {
    const config = loadIsolatedConfig();
    assert.ok(config.categories.github);
    assert.ok(config.categories.article);
    assert.ok(config.categories.tweet);
  });

  test('defaults to the Codex provider and gpt-5.3-codex-spark model', () => {
    const config = loadIsolatedConfig();

    assert.strictEqual(config.ai.provider, 'codex');
    assert.strictEqual(config.ai.autoInvoke, true);
    assert.strictEqual(config.ai.codex.model, 'gpt-5.3-codex-spark');
  });

  test('merges nested provider configuration', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xhoard-config-'));
    const configPath = path.join(directory, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      ai: {
        provider: 'opencode',
        codex: { timeout: 1234 },
        opencode: { model: 'custom/model' }
      }
    }));

    try {
      const config = loadConfig(configPath);
      assert.strictEqual(config.ai.provider, 'opencode');
      assert.strictEqual(config.ai.codex.model, 'gpt-5.3-codex-spark');
      assert.strictEqual(config.ai.codex.timeout, 1234);
      assert.strictEqual(config.ai.opencode.model, 'custom/model');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('normalizes legacy OpenCode configuration', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xhoard-config-'));
    const configPath = path.join(directory, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      autoInvokeOpencode: false,
      opencodeModel: 'opencode/legacy-model',
      opencodeTimeout: 4321
    }));

    try {
      const config = loadConfig(configPath);
      assert.strictEqual(config.ai.provider, 'opencode');
      assert.strictEqual(config.ai.autoInvoke, false);
      assert.strictEqual(config.ai.opencode.model, 'opencode/legacy-model');
      assert.strictEqual(config.ai.opencode.timeout, 4321);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('applies Codex environment overrides', () => {
    const previousProvider = process.env.AI_PROVIDER;
    const previousModel = process.env.CODEX_MODEL;
    const previousTimeout = process.env.CODEX_TIMEOUT;
    process.env.AI_PROVIDER = 'codex';
    process.env.CODEX_MODEL = 'gpt-5.3-codex-spark-fast';
    process.env.CODEX_TIMEOUT = '1234';

    try {
      const config = loadIsolatedConfig();
      assert.strictEqual(config.ai.provider, 'codex');
      assert.strictEqual(config.ai.codex.model, 'gpt-5.3-codex-spark-fast');
      assert.strictEqual(config.ai.codex.timeout, 1234);
    } finally {
      for (const [key, value] of Object.entries({
        AI_PROVIDER: previousProvider,
        CODEX_MODEL: previousModel,
        CODEX_TIMEOUT: previousTimeout
      })) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('expands tilde in archive paths', () => {
    // This tests the integration - loadConfig should expand tildes
    const config = loadIsolatedConfig();
    // Default paths don't use ~, but the function should work
    assert.ok(!config.archiveFile.includes('~'));
  });
});
