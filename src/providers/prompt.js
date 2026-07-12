import fs from 'fs';

const OPENCODE_COMMAND_URL = new URL('../../.opencode/commands/process-bookmarks.md', import.meta.url);

/**
 * Use the OpenCode command body as the shared bookmark-processing contract.
 * Keeping it in one place prevents Codex and manual OpenCode runs from
 * silently diverging on archive output requirements.
 */
export function loadBookmarkProcessingPrompt() {
  const command = fs.readFileSync(OPENCODE_COMMAND_URL, 'utf8');
  return command.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, '').trim();
}
