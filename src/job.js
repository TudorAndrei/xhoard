/**
 * Xhoard Scheduled Job
 *
 * Full two-phase workflow:
 * 1. Fetch bookmarks, expand links, extract content
 * 2. Invoke OpenCode via SDK for analysis and filing
 *
 * Can be used with:
 * - Cron: "0,30 * * * *" (every 30 min) - node /path/to/xhoard/src/job.js
 * - Bree: Import and add to your Bree jobs array
 * - systemd timers: See README for setup
 * - Any other scheduler
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createOpencode } from '@opencode-ai/sdk';
import { fetchAndPrepareBookmarks } from './processor.js';
import { loadConfig } from './config.js';

const JOB_NAME = 'xhoard';
const LOCK_FILE = path.join(os.tmpdir(), 'xhoard.lock');

// ============================================================================
// Shared Constants - Animation & Display
// ============================================================================

const SPINNER_FRAMES = ['|', '/', '-', '\\'];

const SPINNER_MESSAGES = [
  'Analyzing bookmarks',
  'Reading extracted content',
  'Classifying items',
  'Writing archive files',
  'Updating knowledge notes',
  'Finalizing batch',
];

// ============================================================================
// Shared Helper Functions - Display & Progress
// ============================================================================

/**
 * Format elapsed time from startTime
 * @param {number} startTime - Start timestamp from Date.now()
 * @returns {string} Formatted time like "45s" or "2m 30s"
 */
function elapsed(startTime) {
  const ms = Date.now() - startTime;
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs/60)}m ${secs%60}s`;
}

/**
 * Stop spinner intervals and clear the line
 * @param {Object} intervals - Object with spinnerInterval and msgInterval
 */
function stopSpinner(intervals) {
  intervals.active = false;
  clearInterval(intervals.spinnerInterval);
  clearInterval(intervals.msgInterval);
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
}

/**
 * Display a short startup message
 * @param {number} totalBookmarks - Number of bookmarks to process
 */
async function showStartMessage(totalBookmarks) {
  process.stdout.write(`\n  Starting OpenCode session for ${totalBookmarks} bookmark(s)...\n`);
}

/**
 * Build token usage display string for result output
 * @param {Object} tokenUsage - Token usage tracking object
 * @param {boolean} trackTokens - Whether to display tokens
 * @returns {string} Formatted token display or empty string
 */
function buildTokenDisplay(tokenUsage, trackTokens) {
  if (!trackTokens || (tokenUsage.input === 0 && tokenUsage.output === 0)) {
    return '';
  }

  const formatNum = (n) => n.toLocaleString();

  let display = `
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  📊 TOKEN USAGE
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Main (${tokenUsage.model}):
    Input:       ${formatNum(tokenUsage.input).padStart(10)} tokens
    Output:      ${formatNum(tokenUsage.output).padStart(10)} tokens
    Cache Read:  ${formatNum(tokenUsage.cacheRead).padStart(10)} tokens
    Cache Write: ${formatNum(tokenUsage.cacheWrite).padStart(10)} tokens
`;

  if (tokenUsage.subagentInput > 0 || tokenUsage.subagentOutput > 0) {
    display += `
  Subagents (${tokenUsage.subagentModel || 'unknown'}):
    Input:       ${formatNum(tokenUsage.subagentInput).padStart(10)} tokens
    Output:      ${formatNum(tokenUsage.subagentOutput).padStart(10)} tokens
`;
  }

  return display;
}

// ============================================================================
// Lock Management - Prevents overlapping runs
// ============================================================================

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const { pid, timestamp } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      try {
        process.kill(pid, 0); // Check if process exists
        const age = Date.now() - timestamp;
        if (age < 20 * 60 * 1000) { // 20 minute timeout
          console.log(`[${JOB_NAME}] Previous run still in progress (PID ${pid}). Skipping.`);
          return false;
        }
        console.log(`[${JOB_NAME}] Stale lock found (${Math.round(age / 60000)}min old). Overwriting.`);
      } catch (e) {
        console.log(`[${JOB_NAME}] Removing stale lock (PID ${pid} no longer running)`);
      }
    } catch (e) {
      // Invalid lock file
    }
    fs.unlinkSync(LOCK_FILE);
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
  return true;
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const { pid } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      if (pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (e) {}
}


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

async function invokeAICLI(config, bookmarkCount, options = {}) {
  const timeout = config.opencodeTimeout || 900000;
  const trackTokens = options.trackTokens || false;
  const model = config.opencodeModel || 'opencode/glm-4.7-free';
  const runDir = config.projectRoot || process.cwd();

  await showStartMessage(bookmarkCount);

  const startTime = Date.now();
  let spinnerFrame = 0;
  let spinnerMsgFrame = 0;
  let currentSpinnerMsg = SPINNER_MESSAGES[0];
  const intervals = { active: true, spinnerInterval: null, msgInterval: null };

  intervals.msgInterval = setInterval(() => {
    if (!intervals.active) return;
    spinnerMsgFrame = (spinnerMsgFrame + 1) % SPINNER_MESSAGES.length;
    currentSpinnerMsg = SPINNER_MESSAGES[spinnerMsgFrame];
  }, 10000);

  intervals.spinnerInterval = setInterval(() => {
    if (!intervals.active) return;
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    const frame = SPINNER_FRAMES[spinnerFrame];
    process.stdout.write(`\r  ${frame} ${currentSpinnerMsg}... [${elapsed(startTime)}]          `);
  }, 150);

  process.stdout.write('\n  Processing bookmarks. This can take a few minutes.\n');
  process.stdout.write('  ...');

  let timeoutId = null;
  let timedOut = false;
  let server = null;
  let client = null;
  let sessionId = null;

  try {
    const sdk = await createOpencode({
      config: { model }
    });

    client = sdk.client;
    server = sdk.server;

    const createResult = await client.session.create({
      body: {
        title: `Xhoard bookmark batch ${new Date().toISOString()}`
      },
      query: { directory: runDir }
    });

    if (createResult.error) {
      throw new Error(summarizeOpencodeError(createResult));
    }

    sessionId = createResult.data.id;
    const parsedModel = parseModel(model);

    timeoutId = setTimeout(async () => {
      timedOut = true;
      if (!client || !sessionId) return;

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
      return {
        success: false,
        error: `Timeout after ${timeout}ms`
      };
    }

    if (commandResult.error) {
      throw new Error(summarizeOpencodeError(commandResult));
    }

    const info = commandResult.data.info;
    const parts = commandResult.data.parts || [];
    const tokenUsage = {
      input: info.tokens?.input || 0,
      output: info.tokens?.output || 0,
      cacheRead: info.tokens?.cache?.read || 0,
      cacheWrite: info.tokens?.cache?.write || 0,
      subagentInput: 0,
      subagentOutput: 0,
      model: `${info.providerID}/${info.modelID}`,
      subagentModel: null
    };

    stopSpinner(intervals);

    const tokenDisplay = buildTokenDisplay(tokenUsage, trackTokens);

    process.stdout.write(`

  Batch complete.

  Duration:    ${elapsed(startTime)}
  Bookmarks:   ${bookmarkCount} processed
  Runtime:     OpenCode SDK
${tokenDisplay}
  Xhoard run finished.

`);

    return {
      success: true,
      output: extractTextFromParts(parts),
      tokenUsage
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'OpenCode SDK invocation failed'
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    stopSpinner(intervals);

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

// ============================================================================
// Webhook Notifications (Optional)
// ============================================================================

async function sendWebhook(config, payload) {
  if (!config.webhookUrl) return;

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Webhook error: ${error.message}`);
  }
}

function formatDiscordPayload(title, description, success = true) {
  return {
    embeds: [{
      title,
      description,
      color: success ? 0x00ff00 : 0xff0000,
      timestamp: new Date().toISOString()
    }]
  };
}

function formatSlackPayload(title, description, success = true) {
  return {
    text: title,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${success ? '✅' : '❌'} ${title}` }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: description }
      }
    ]
  };
}

async function notify(config, title, description, success = true) {
  if (!config.webhookUrl) return;

  let payload;
  if (config.webhookType === 'slack') {
    payload = formatSlackPayload(title, description, success);
  } else {
    // Default to Discord format
    payload = formatDiscordPayload(title, description, success);
  }

  await sendWebhook(config, payload);
}

// ============================================================================
// Main Job Runner
// ============================================================================

export async function run(options = {}) {
  const startTime = Date.now();
  const now = new Date().toISOString();
  const config = loadConfig(options.configPath);

  console.log(`[${now}] Starting xhoard job...`);

  // Overlap protection
  if (!acquireLock()) {
    return { success: true, skipped: true };
  }

  try {
    // Ensure per-bookmark archive directory exists before AI writes into it
    if ((config.archiveMode || (config.archiveDir ? 'files' : 'single')) === 'files' && config.archiveDir) {
      const base = config.projectRoot || process.cwd();
      const archiveDir = path.isAbsolute(config.archiveDir)
        ? config.archiveDir
        : path.join(base, config.archiveDir);
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }
    }

    // Check for existing pending bookmarks first
    let pendingData = null;
    let bookmarkCount = 0;

    if (fs.existsSync(config.pendingFile)) {
      try {
        pendingData = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
        bookmarkCount = pendingData.bookmarks?.length || 0;

        // Apply --limit if specified (process subset of pending)
        const limit = options.limit;
        if (limit && limit > 0 && bookmarkCount > limit) {
          console.log(`[${now}] Limiting to ${limit} of ${bookmarkCount} pending bookmarks`);
          pendingData.bookmarks = pendingData.bookmarks.slice(0, limit);
          bookmarkCount = limit;
          // Write limited subset back (temporarily)
          fs.writeFileSync(config.pendingFile + '.full', JSON.stringify(
            JSON.parse(fs.readFileSync(config.pendingFile, 'utf8')), null, 2
          ));
          pendingData.count = bookmarkCount;
          fs.writeFileSync(config.pendingFile, JSON.stringify(pendingData, null, 2));
        }
      } catch (e) {
        // Invalid pending file, will fetch fresh
      }
    }

    // Phase 1: Fetch new bookmarks (merges with existing pending)
    if (bookmarkCount === 0 || options.forceFetch) {
      console.log(`[${now}] Phase 1: Fetching and preparing bookmarks...`);
      const prepResult = await fetchAndPrepareBookmarks(options);

      // Re-read pending file after fetch
      if (fs.existsSync(config.pendingFile)) {
        pendingData = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
        bookmarkCount = pendingData.bookmarks?.length || 0;
      }

      if (prepResult.count > 0) {
        console.log(`[${now}] Fetched ${prepResult.count} new bookmarks`);
      }
    } else {
      console.log(`[${now}] Found ${bookmarkCount} pending bookmarks, skipping fetch`);
    }

    if (bookmarkCount === 0) {
      console.log(`[${now}] No bookmarks to process`);
      return { success: true, count: 0, duration: Date.now() - startTime };
    }

    console.log(`[${now}] Processing ${bookmarkCount} bookmarks`);

    // Track IDs we're about to process
    const idsToProcess = pendingData.bookmarks.map(b => b.id);

    // Phase 2: OpenCode analysis
    const shouldInvoke = config.autoInvokeOpencode !== false;

    if (shouldInvoke) {
      console.log(`[${now}] Phase 2: Invoking OpenCode for analysis...`);

      const aiResult = await invokeAICLI(config, bookmarkCount, {
        trackTokens: options.trackTokens
      });

      if (aiResult.success) {
        console.log(`[${now}] Analysis complete`);

        // Remove processed IDs from pending file
        // If we used --limit, restore from .full file first
        const fullFile = config.pendingFile + '.full';
        let sourceData;
        if (fs.existsSync(fullFile)) {
          sourceData = JSON.parse(fs.readFileSync(fullFile, 'utf8'));
          fs.unlinkSync(fullFile); // Clean up .full file
        } else if (fs.existsSync(config.pendingFile)) {
          sourceData = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
        }

        if (sourceData) {
          const processedIds = new Set(idsToProcess);
          const remaining = sourceData.bookmarks.filter(b => !processedIds.has(b.id));

          fs.writeFileSync(config.pendingFile, JSON.stringify({
            generatedAt: sourceData.generatedAt,
            count: remaining.length,
            bookmarks: remaining
          }, null, 2));

          console.log(`[${now}] Cleaned up ${idsToProcess.length} processed bookmarks, ${remaining.length} remaining`);
        }

        // Send success notification
        await notify(
          config,
          'Bookmarks Processed',
          `**New:** ${bookmarkCount} bookmarks archived`,
          true
        );

        return {
          success: true,
          count: bookmarkCount,
          duration: Date.now() - startTime,
          output: aiResult.output,
          tokenUsage: aiResult.tokenUsage
        };

      } else {
        // AI failed - restore full pending file for retry
        const fullFile = config.pendingFile + '.full';
        if (fs.existsSync(fullFile)) {
          fs.copyFileSync(fullFile, config.pendingFile);
          fs.unlinkSync(fullFile);
          console.log(`[${now}] Restored full pending file for retry`);
        }

        console.error(`[${now}] OpenCode failed:`, aiResult.error);

        await notify(
          config,
          'Bookmark Processing Failed',
          `Prepared ${bookmarkCount} bookmarks but analysis failed:\n${aiResult.error}`,
          false
        );

        return {
          success: false,
          count: bookmarkCount,
          duration: Date.now() - startTime,
          error: aiResult.error
        };
      }
    } else {
      // Auto-invoke disabled - just fetch
      console.log(`[${now}] OpenCode auto-invoke disabled. Run '/process-bookmarks' in OpenCode manually if needed.`);

      return {
        success: true,
        count: bookmarkCount,
        duration: Date.now() - startTime,
        pendingFile: config.pendingFile
      };
    }

  } catch (error) {
    console.error(`[${now}] Job error:`, error.message);

    await notify(
      config,
      'Xhoard Job Failed',
      `Error: ${error.message}`,
      false
    );

    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  } finally {
    releaseLock();
  }
}

// ============================================================================
// Bree-compatible export
// ============================================================================

export default {
  name: JOB_NAME,
  interval: '*/30 * * * *', // Every 30 minutes
  timezone: 'America/New_York',
  run
};

// ============================================================================
// Direct execution
// ============================================================================

if (process.argv[1] && process.argv[1].endsWith('job.js')) {
  run().then(result => {
    // Exit silently - run output is sufficient
    process.exit(result.success ? 0 : 1);
  });
}
