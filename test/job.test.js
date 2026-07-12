import { describe, test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { run } from '../src/job.js';

function createPendingBatch(directory) {
  const pendingFile = path.join(directory, '.state', 'pending-bookmarks.json');
  fs.mkdirSync(path.dirname(pendingFile), { recursive: true });
  fs.writeFileSync(pendingFile, JSON.stringify({
    generatedAt: '2026-01-01T00:00:00.000Z',
    count: 1,
    bookmarks: [{ id: '123', author: 'xhoard', text: 'Bookmark to preserve' }]
  }, null, 2));
  return pendingFile;
}

describe('job provider failures', () => {
  test('preserves pending bookmarks when the selected provider fails', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xhoard-job-'));
    const pendingFile = createPendingBatch(directory);
    const configPath = path.join(directory, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      projectRoot: directory,
      archiveDir: path.join(directory, 'bookmarks'),
      pendingFile,
      stateFile: path.join(directory, '.state', 'state.json'),
      ai: {
        provider: 'codex',
        autoInvoke: true
      }
    }));

    try {
      const result = await run({
        configPath,
        quiet: true,
        invokeProvider: async () => ({
          success: false,
          error: 'Codex authentication failed. Run `codex login`.'
        })
      });

      assert.strictEqual(result.success, false);
      assert.match(result.error, /codex login/i);
      const pending = JSON.parse(fs.readFileSync(pendingFile, 'utf8'));
      assert.strictEqual(pending.bookmarks.length, 1);
      assert.strictEqual(pending.bookmarks[0].id, '123');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
