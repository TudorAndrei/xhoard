import { TwitterClientBase } from './client-base.js';
import { withSearch } from './search.js';
import { withTimelines } from './timelines.js';
import { withTweetDetails } from './tweet-detail.js';
import { withUserLookup } from './user-lookup.js';

const Mixed = withUserLookup(withTimelines(withSearch(withTweetDetails(TwitterClientBase))));

export class TwitterClient extends Mixed {}
