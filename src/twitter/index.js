// Xhoard's native Twitter client, vendored and trimmed from @leavingme/bird v0.8.4 (MIT).
// Exposes the four operations the bookmark pipeline actually uses: fetchBookmarks,
// fetchLikes, fetchTweet, searchTweets. Matches the JSON shapes the old `bird` CLI
// emitted so the surrounding processor.js logic is unchanged.

import { TwitterClient } from './client.js';

const DEFAULT_TIMEOUT_MS = 60000;
const PAGINATED_TIMEOUT_MS = 180000;

function makeClient(config, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!config?.twitter?.authToken || !config?.twitter?.ct0) {
    throw new Error('Missing Twitter credentials: config.twitter.authToken and config.twitter.ct0 are required');
  }
  return new TwitterClient({
    cookies: {
      authToken: config.twitter.authToken,
      ct0: config.twitter.ct0,
    },
    timeoutMs,
  });
}

export async function fetchBookmarks(config, count = 20, options = {}) {
  const { all, maxPages, folderId } = options;
  const usePagination = Boolean(all) || count > 50;
  const client = makeClient(config, usePagination ? PAGINATED_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  const effectiveMaxPages = maxPages ?? Math.max(Math.ceil(count / 20), 10);

  let result;
  if (folderId) {
    result = usePagination
      ? await client.getAllBookmarkFolderTimeline(folderId, { maxPages: effectiveMaxPages })
      : await client.getBookmarkFolderTimeline(folderId, count);
  } else {
    result = usePagination
      ? await client.getAllBookmarks({ maxPages: effectiveMaxPages })
      : await client.getBookmarks(count);
  }

  if (!result.success) {
    throw new Error(`Failed to fetch bookmarks: ${result.error}`);
  }

  let tweets = result.tweets || [];
  if (!all && tweets.length > count) {
    tweets = tweets.slice(0, count);
  }
  return tweets;
}

export async function fetchLikes(config, count = 20) {
  const client = makeClient(config);
  const result = await client.getLikes(count);
  if (!result.success) {
    throw new Error(`Failed to fetch likes: ${result.error}`);
  }
  return result.tweets || [];
}

export async function fetchTweet(config, tweetId) {
  const client = makeClient(config, 15000);
  const result = await client.getTweet(tweetId);
  if (!result.success) {
    throw new Error(result.error || `Could not fetch tweet ${tweetId}`);
  }
  return result.tweet || null;
}

export async function searchTweets(config, query, count = 20) {
  const client = makeClient(config, 30000);
  const result = await client.search(query, count);
  if (!result.success) {
    throw new Error(`Search failed: ${result.error}`);
  }
  return result.tweets || [];
}
