# Xhoard

Archive your Twitter/X bookmarks (and likes, optionally) to markdown. Automatically.

Xhoard fetches bookmarks via Twitter's GraphQL API directly (no external CLI required), extracts content from linked pages, and uses [OpenCode](https://github.com/opencode-ai/opencode) to categorize and file them.

## Quick Start

```bash
git clone https://github.com/TudorAndrei/xhoard
cd xhoard
bun install
bun src/cli.js setup
```

The setup wizard collects your Twitter cookies, tests them, writes `xhoard.config.json`, and fetches a first batch.

Or run without installing (GitHub Actions, etc.):

```bash
AUTH_TOKEN=xxx CT0=xxx bunx xhoard fetch
```

## Twitter Credentials

Xhoard needs two session cookies:

1. Open Twitter/X, then DevTools → Application → Cookies
2. Copy `auth_token` and `ct0`
3. Either paste into the setup wizard or edit `xhoard.config.json`:

```json
{
  "twitter": {
    "authToken": "your_auth_token",
    "ct0": "your_ct0"
  }
}
```

`xhoard.config.json` is gitignored.

## What It Does

1. Fetches bookmarks (or likes, or both) from Twitter/X
2. Expands `t.co` links, pulls content from linked pages (articles, GitHub READMEs, X long-form articles, quoted/reply context)
3. Invokes OpenCode to categorize each item
4. Writes one markdown file per bookmark under `bookmarks/YYYY-MM-DD/`, plus knowledge files under `knowledge/tools/` and `knowledge/articles/`

## Commands

```bash
bun src/cli.js fetch              # Fetch 20 latest
bun src/cli.js fetch 50           # Fetch 50
bun src/cli.js fetch --all        # Paginate all bookmarks
bun src/cli.js fetch --source likes
bun src/cli.js fetch --source both
bun src/cli.js run                # Fetch + process with OpenCode
bun src/cli.js run --limit 50 -t  # Batch + token tracking
bun src/cli.js status
```

## Automation

PM2 (recommended):

```bash
pm2 start "bun src/cli.js run --quiet" --cron "*/30 * * * *" --name xhoard
pm2 save
```

Cron:

```
*/30 * * * * cd /path/to/xhoard && bun src/cli.js run >> xhoard.log 2>&1
```

GitHub Actions: copy `.github/workflows/archive-bookmarks.yml` and add `TWITTER_AUTH_TOKEN` / `TWITTER_CT0` secrets.

## Configuration

See `xhoard.config.example.json` for the full shape. Common options:

| Option | Default | Description |
| --- | --- | --- |
| `source` | `bookmarks` | `bookmarks`, `likes`, or `both` |
| `archiveDir` | `./bookmarks` | Where per-bookmark files are written |
| `folders` | `{}` | Map bookmark-folder IDs to tag names |
| `categories` | (defaults) | Routing rules for linked content |
| `includeMedia` | `false` | Experimental: include photos/videos/GIFs |
| `autoInvokeOpencode` | `true` | Run OpenCode after fetching |
| `opencodeModel` | `opencode/glm-4.7-free` | Model to use |
| `webhookUrl` | `null` | Discord/Slack notifications |

Env vars work too: `AUTH_TOKEN`, `CT0`, `SOURCE`, `INCLUDE_MEDIA`, `ARCHIVE_DIR`, `TIMEZONE`, `OPENCODE_MODEL`.

### Bookmark folders

If you organize bookmarks into folders on Twitter, map the folder ID (from `x.com/i/bookmarks/<id>`) to a tag name:

```json
{
  "folders": {
    "1234567890": "ai-tools",
    "0987654321": "articles-to-read"
  }
}
```

Each bookmark gets tagged with its folder name in the output.

## Troubleshooting

- **401/403 when fetching**: your Twitter cookies expired. Grab fresh `auth_token` / `ct0` from DevTools.
- **"No new bookmarks"**: everything fetched already exists in `bookmarks/`. To reset: `rm -rf .state/ bookmarks/ knowledge/`.
- **Processing is slow**: pick a faster `opencodeModel`, or batch with `run --limit N`.

## Credits

- Twitter GraphQL client vendored and trimmed from [@leavingme/bird](https://www.npmjs.com/package/@leavingme/bird) (a fork of [@steipete/bird](https://github.com/steipete/bird)). See `LICENSE` for attribution.
- Forked from [smaug](https://github.com/alexknowshtml/smaug).

## License

MIT
