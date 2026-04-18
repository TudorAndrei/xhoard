/**
 * Configuration loader for xhoard
 *
 * Defaults live in xhoard.config.example.json at the package root — single
 * source of truth. loadConfig reads it as the base layer; initConfig copies
 * it to kick-start a new setup.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const EXAMPLE_CONFIG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'xhoard.config.example.json');

function loadDefaults() {
  const raw = fs.readFileSync(EXAMPLE_CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

export function expandTilde(filepath) {
  if (!filepath || typeof filepath !== 'string') return filepath;
  if (filepath.startsWith('~/')) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  if (filepath === '~') {
    return os.homedir();
  }
  return filepath;
}

/**
 * Load configuration from file and environment
 */
export function loadConfig(configPath) {
  const defaults = loadDefaults();
  let fileConfig = {};

  const configLocations = [
    configPath,
    './xhoard.config.json',
    path.join(os.homedir(), '.xhoard.json'),
    path.join(os.homedir(), '.config/xhoard/config.json')
  ].filter(Boolean);

  for (const loc of configLocations) {
    try {
      if (fs.existsSync(loc)) {
        const content = fs.readFileSync(loc, 'utf8');
        fileConfig = JSON.parse(content);
        console.log(`Loaded config from ${loc}`);
        break;
      }
    } catch (e) {
      console.warn(`Failed to load config from ${loc}: ${e.message}`);
    }
  }

  const inferredArchiveMode = Object.prototype.hasOwnProperty.call(fileConfig, 'archiveMode')
    ? fileConfig.archiveMode
    : (fileConfig.archiveDir ? 'files' : defaults.archiveMode);

  const config = {
    ...defaults,
    ...fileConfig,
    archiveMode: inferredArchiveMode,
    twitter: { ...defaults.twitter, ...fileConfig.twitter },
    categories: { ...defaults.categories, ...fileConfig.categories },
    folders: { ...defaults.folders, ...fileConfig.folders }
  };

  // Env var overrides
  if (process.env.ARCHIVE_MODE) config.archiveMode = process.env.ARCHIVE_MODE;
  if (process.env.ARCHIVE_DIR) config.archiveDir = process.env.ARCHIVE_DIR;
  if (process.env.ARCHIVE_FILE) config.archiveFile = process.env.ARCHIVE_FILE;
  if (process.env.PENDING_FILE) config.pendingFile = process.env.PENDING_FILE;
  if (process.env.STATE_FILE) config.stateFile = process.env.STATE_FILE;
  if (process.env.TIMEZONE) config.timezone = process.env.TIMEZONE;
  if (process.env.SOURCE) config.source = process.env.SOURCE;
  if (process.env.INCLUDE_MEDIA !== undefined) config.includeMedia = process.env.INCLUDE_MEDIA === 'true';
  if (process.env.AUTH_TOKEN) config.twitter.authToken = process.env.AUTH_TOKEN;
  if (process.env.CT0) config.twitter.ct0 = process.env.CT0;
  if (process.env.AUTO_INVOKE_OPENCODE !== undefined) config.autoInvokeOpencode = process.env.AUTO_INVOKE_OPENCODE === 'true';
  if (process.env.OPENCODE_MODEL) config.opencodeModel = process.env.OPENCODE_MODEL;
  if (process.env.OPENCODE_TIMEOUT) config.opencodeTimeout = parseInt(process.env.OPENCODE_TIMEOUT, 10);
  if (process.env.PROJECT_ROOT) config.projectRoot = process.env.PROJECT_ROOT;
  if (process.env.WEBHOOK_URL) config.webhookUrl = process.env.WEBHOOK_URL;
  if (process.env.WEBHOOK_TYPE) config.webhookType = process.env.WEBHOOK_TYPE;

  config.archiveDir = expandTilde(config.archiveDir);
  config.archiveFile = expandTilde(config.archiveFile);
  config.pendingFile = expandTilde(config.pendingFile);
  config.stateFile = expandTilde(config.stateFile);
  config.projectRoot = expandTilde(config.projectRoot);

  if (config.categories) {
    for (const key of Object.keys(config.categories)) {
      if (config.categories[key]?.folder) {
        config.categories[key].folder = expandTilde(config.categories[key].folder);
      }
    }
  }

  return config;
}

/**
 * Create a config file by copying the example.
 */
export function initConfig(targetPath = './xhoard.config.json') {
  fs.copyFileSync(EXAMPLE_CONFIG_PATH, targetPath);
  console.log(`Created config file at ${targetPath}`);
  console.log('Edit this file to add your Twitter credentials.');
  return targetPath;
}
